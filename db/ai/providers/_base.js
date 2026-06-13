// db/ai/providers/_base.js — abstract interface all providers implement
//
// Every provider module must export:
//   - kind: string ('openai' | 'anthropic' | 'openai_compat')
//   - label: string shown in admin UI
//   - defaultBaseUrl: string (or null if not applicable)
//   - defaultModel: string
//   - models: array of common models for that kind
//   - async test({ apiKey, baseUrl, model }) -> { ok: bool, message?: string }
//   - async generate({ apiKey, baseUrl, model, system, prompt, maxTokens, temperature }) -> { text, model }

module.exports = {
  // Subclasses must override
  kind: 'base',
  label: 'Base provider',
  defaultBaseUrl: null,
  defaultModel: '',
  models: [],
  test: async () => ({ ok: false, message: 'Not implemented' }),
  generate: async () => { throw new Error('Not implemented'); },
};
