// db/ai/providers/openai.js — OpenAI Chat Completions
// API: https://platform.openai.com/docs/api-reference/chat
const https = require('https');
const base = require('./_base');

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

function httpsPost(host, port, path, headers, body) {
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

async function test({ apiKey, baseUrl, model }) {
  if (!apiKey) return { ok: false, message: 'No API key' };
  const url = new URL(baseUrl || DEFAULT_BASE);
  const body = JSON.stringify({
    model: model || DEFAULT_MODEL,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 5,
  });
  try {
    const res = await httpsPost(
      url.hostname, url.port || 443, url.pathname + '/chat/completions',
      {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
      body
    );
    if (res.status === 200) return { ok: true, message: 'Connected to OpenAI.' };
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(res.data); msg = (j.error && j.error.message) || msg; } catch (_) {}
    return { ok: false, message: msg };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function generate({ apiKey, baseUrl, model, system, prompt, maxTokens = 1500, temperature = 0.4 }) {
  if (!apiKey) throw new Error('OpenAI provider: missing API key');
  const url = new URL(baseUrl || DEFAULT_BASE);
  const body = JSON.stringify({
    model: model || DEFAULT_MODEL,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens,
    temperature,
  });
  const res = await httpsPost(
    url.hostname, url.port || 443, url.pathname + '/chat/completions',
    {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'Content-Length': Buffer.byteLength(body),
    },
    body
  );
  if (res.status !== 200) {
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(res.data); msg = (j.error && j.error.message) || msg; } catch (_) {}
    throw new Error('OpenAI error: ' + msg);
  }
  const j = JSON.parse(res.data);
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new Error('OpenAI returned no content');
  return { text, model: j.model || (model || DEFAULT_MODEL) };
}

module.exports = {
  ...base,
  kind: 'openai',
  label: 'OpenAI',
  defaultBaseUrl: DEFAULT_BASE,
  defaultModel: DEFAULT_MODEL,
  models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini', 'gpt-3.5-turbo'],
  test,
  generate,
};
