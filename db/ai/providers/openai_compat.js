// db/ai/providers/openai_compat.js — any OpenAI-compatible Chat Completions API
// Covers: Ollama, LM Studio, vLLM, OpenRouter, Groq, Together, Mistral, etc.
// Just point baseUrl at their endpoint and use their model name.
const http = require('http');
const https = require('https');
const url = require('url');
const base = require('./_base');

const DEFAULT_BASE = 'http://localhost:11434/v1';  // Ollama default
const DEFAULT_MODEL = 'llama3.1';

function postJson(parsed, body, headers) {
  return new Promise((resolve, reject) => {
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      host: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + '/chat/completions', method: 'POST', headers,
    }, (res) => {
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
  if (!baseUrl) return { ok: false, message: 'No base URL set' };
  const parsed = url.parse(baseUrl);
  const body = JSON.stringify({
    model: model || DEFAULT_MODEL,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 5,
  });
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
  try {
    const res = await postJson(parsed, body, headers);
    if (res.status === 200) return { ok: true, message: 'Connected to ' + (parsed.host || baseUrl) };
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(res.data); msg = (j.error && j.error.message) || msg; } catch (_) {}
    return { ok: false, message: msg };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function generate({ apiKey, baseUrl, model, system, prompt, maxTokens = 1500, temperature = 0.4 }) {
  if (!baseUrl) throw new Error('OpenAI-compat provider: missing base URL');
  const parsed = url.parse(baseUrl);
  const body = JSON.stringify({
    model: model || DEFAULT_MODEL,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens,
    temperature,
  });
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
  const res = await postJson(parsed, body, headers);
  if (res.status !== 200) {
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(res.data); msg = (j.error && j.error.message) || msg; } catch (_) {}
    throw new Error('OpenAI-compat error: ' + msg);
  }
  const j = JSON.parse(res.data);
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new Error('Endpoint returned no content');
  return { text, model: j.model || (model || DEFAULT_MODEL) };
}

module.exports = {
  ...base,
  kind: 'openai_compat',
  label: 'OpenAI-compatible (Ollama, OpenRouter, Groq, Together, LM Studio, etc.)',
  defaultBaseUrl: DEFAULT_BASE,
  defaultModel: DEFAULT_MODEL,
  models: [
    // OpenRouter picks from all of these
    'anthropic/claude-sonnet-4-5',
    'openai/gpt-4o-mini',
    'google/gemini-2.0-flash',
    'meta-llama/llama-3.3-70b-instruct',
    'mistralai/mistral-large-latest',
  ],
  test,
  generate,
};
