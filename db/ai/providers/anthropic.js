// db/ai/providers/anthropic.js — Anthropic Messages API
// API: https://docs.anthropic.com/en/api/messages
const https = require('https');
const base = require('./_base');

const DEFAULT_BASE = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-sonnet-4-5';
const API_VERSION = '2023-06-01';

function httpsRequest({ host, port, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, port, path, method: 'POST', headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function test({ apiKey, model }) {
  if (!apiKey) return { ok: false, message: 'No API key' };
  const body = JSON.stringify({
    model: model || DEFAULT_MODEL,
    max_tokens: 5,
    messages: [{ role: 'user', content: 'ping' }],
  });
  try {
    const res = await httpsRequest({
      host: 'api.anthropic.com', port: 443, path: '/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    });
    if (res.status === 200) return { ok: true, message: 'Connected to Anthropic.' };
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(res.data); msg = (j.error && j.error.message) || msg; } catch (_) {}
    return { ok: false, message: msg };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function generate({ apiKey, model, system, prompt, maxTokens = 1500, temperature = 0.4 }) {
  if (!apiKey) throw new Error('Anthropic provider: missing API key');
  const body = JSON.stringify({
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: system || 'You are a helpful assistant.',
    messages: [{ role: 'user', content: prompt }],
  });
  const res = await httpsRequest({
    host: 'api.anthropic.com', port: 443, path: '/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
  if (res.status !== 200) {
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(res.data); msg = (j.error && j.error.message) || msg; } catch (_) {}
    throw new Error('Anthropic error: ' + msg);
  }
  const j = JSON.parse(res.data);
  // Anthropic returns content blocks; concatenate text blocks
  const blocks = (j.content || []).filter(b => b.type === 'text');
  const text = blocks.map(b => b.text).join('\n');
  if (!text) throw new Error('Anthropic returned no text content');
  return { text, model: j.model || (model || DEFAULT_MODEL) };
}

module.exports = {
  ...base,
  kind: 'anthropic',
  label: 'Anthropic',
  defaultBaseUrl: DEFAULT_BASE,
  defaultModel: DEFAULT_MODEL,
  models: ['claude-sonnet-4-5', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
  test,
  generate,
};
