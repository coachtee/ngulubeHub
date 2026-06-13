// db/ai.js — the abstraction layer
//
// Loads providers from the DB, picks one for a given request, and runs the call.
// Falls back through priority chain if the chosen one fails.
const db = require('./schema');

const REGISTRY = {
  openai: require('./ai/providers/openai'),
  anthropic: require('./ai/providers/anthropic'),
  openai_compat: require('./ai/providers/openai_compat'),
};

function adapterFor(kind) {
  return REGISTRY[kind] || null;
}

function listKinds() {
  return Object.entries(REGISTRY).map(([k, v]) => ({
    kind: k, label: v.label, defaultBaseUrl: v.defaultBaseUrl, defaultModel: v.defaultModel, models: v.models,
  }));
}

function listProviders() {
  return db.prepare(`
    SELECT id, name, kind, model, base_url, enabled, is_default, priority,
           last_tested_at, last_test_ok, notes, created_at,
           length(api_key) as api_key_len
    FROM ai_providers ORDER BY priority ASC, id ASC
  `).all();
}

function getProvider(id) {
  return db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(id);
}

function getDefaultProvider() {
  // First the explicit default. Then by priority. Then any enabled.
  return db.prepare(`
    SELECT * FROM ai_providers
    WHERE enabled = 1
    ORDER BY is_default DESC, priority ASC, id ASC
    LIMIT 1
  `).get();
}

function listEnabledInOrder() {
  return db.prepare(`
    SELECT * FROM ai_providers WHERE enabled = 1
    ORDER BY is_default DESC, priority ASC, id ASC
  `).all();
}

function createProvider({ name, kind, api_key, base_url, model, enabled = 1, is_default = 0, priority = 100, notes = '' }) {
  if (!REGISTRY[kind]) throw new Error('Unknown provider kind: ' + kind);
  // If setting this as default, unset the others
  if (is_default) db.prepare('UPDATE ai_providers SET is_default = 0').run();
  const result = db.prepare(`
    INSERT INTO ai_providers (name, kind, api_key, base_url, model, enabled, is_default, priority, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, kind, api_key || null, base_url || null, model || null, enabled ? 1 : 0, is_default ? 1 : 0, priority, notes || null);
  return getProvider(result.lastInsertRowid);
}

function updateProvider(id, fields) {
  const cur = getProvider(id);
  if (!cur) return null;
  const next = { ...cur, ...fields };
  if (next.is_default) db.prepare('UPDATE ai_providers SET is_default = 0 WHERE id != ?').run(id);
  db.prepare(`
    UPDATE ai_providers SET
      name = ?, kind = ?, api_key = ?, base_url = ?, model = ?,
      enabled = ?, is_default = ?, priority = ?, notes = ?
    WHERE id = ?
  `).run(next.name, next.kind, next.api_key, next.base_url, next.model,
         next.enabled ? 1 : 0, next.is_default ? 1 : 0, next.priority, next.notes, id);
  return getProvider(id);
}

function deleteProvider(id) {
  db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id);
}

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 8) return '****';
  return k.slice(0, 4) + '…' + k.slice(-4);
}

function withApiKey(p) {
  if (!p) return null;
  return {
    apiKey: p.api_key,
    baseUrl: p.base_url,
    model: p.model,
  };
}

async function testConnection(id) {
  const p = getProvider(id);
  if (!p) return { ok: false, message: 'Provider not found' };
  const adapter = adapterFor(p.kind);
  if (!adapter) return { ok: false, message: 'Unknown kind: ' + p.kind };
  const result = await adapter.test(withApiKey(p));
  db.prepare('UPDATE ai_providers SET last_tested_at = CURRENT_TIMESTAMP, last_test_ok = ? WHERE id = ?')
    .run(result.ok ? 1 : 0, id);
  return result;
}

// Run a generation through the failover chain.
// Returns { text, provider, model, attempts }.
async function generate(prompt, opts = {}) {
  const { system, maxTokens, temperature, providerId, feature } = opts;
  const candidates = providerId
    ? [getProvider(providerId)].filter(Boolean)
    : listEnabledInOrder();
  if (!candidates.length) {
    throw new Error('No AI provider configured. Add one in /admin/providers.');
  }
  const errors = [];
  for (const p of candidates) {
    const adapter = adapterFor(p.kind);
    if (!adapter) continue;
    try {
      const out = await adapter.generate({ ...withApiKey(p), system, prompt, maxTokens, temperature });
      // Track usage (light)
      if (feature) console.log(`[ai] feature=${feature} provider=${p.name} kind=${p.kind} model=${out.model}`);
      return { text: out.text, provider: { id: p.id, name: p.name, kind: p.kind }, model: out.model };
    } catch (e) {
      errors.push({ provider: p.name, error: e.message });
      // continue to next
    }
  }
  throw new Error('All AI providers failed: ' + JSON.stringify(errors));
}

// Cache helpers for prep
function getCachedPrep(clientId) {
  return db.prepare('SELECT * FROM ai_prep_cache WHERE client_id = ?').get(clientId);
}
function setCachedPrep(clientId, { provider_id, model, content }) {
  db.prepare(`
    INSERT INTO ai_prep_cache (client_id, provider_id, model, content_json, generated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(client_id) DO UPDATE SET
      provider_id = excluded.provider_id,
      model = excluded.model,
      content_json = excluded.content_json,
      generated_at = CURRENT_TIMESTAMP
  `).run(clientId, provider_id, model, JSON.stringify(content));
}
function clearCachedPrep(clientId) {
  db.prepare('DELETE FROM ai_prep_cache WHERE client_id = ?').run(clientId);
}

module.exports = {
  REGISTRY,
  adapterFor,
  listKinds,
  listProviders, getProvider, getDefaultProvider,
  createProvider, updateProvider, deleteProvider, maskKey,
  testConnection, generate,
  getCachedPrep, setCachedPrep, clearCachedPrep,
};
