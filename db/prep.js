// db/prep.js — AI meeting prep generator
//
// Two modes:
//   1. Structured-only (no AI) — pulls from the DB, no API call
//   2. AI-enhanced — sends a synthesis prompt to the configured provider
//
// Output shape (always the same):
//   {
//     who: string,                 // who they are (2-3 sentences)
//     where_we_are: string,        // pipeline state
//     talking_points: string[],    // 3-5 questions to ask
//     what_i_can_offer: string[],  // 2-3 solutions + why they fit
//     next_step: string,           // suggested next step after the call
//     open_threads: string[],      // unresolved items
//     recent_interactions: [],     // for context
//   }
const ai = require('./ai');
const db = require('./schema');

function safeArr(x) { try { return JSON.parse(x || '[]'); } catch (_) { return []; } }

function buildContext(clientId) {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!c) return null;
  const interactions = db.prepare(
    'SELECT type, summary, created_at FROM interactions WHERE client_id = ? ORDER BY created_at DESC LIMIT 8'
  ).all(clientId);
  const tasks = db.prepare(`
    SELECT t.id, t.title, t.due_date, t.priority, t.status, p.name as project_name
    FROM tasks t
    INNER JOIN projects p ON p.id = t.project_id
    WHERE p.client_id = ? AND t.status NOT IN ('done', 'cancelled')
    ORDER BY t.due_date ASC LIMIT 5
  `).all(clientId);
  return {
    client: c,
    interactions,
    tasks,
    focus: safeArr(c.focus_areas),
    pains: safeArr(c.pain_points),
    solutions: safeArr(c.ai_solutions),
    tags: safeArr(c.tags),
  };
}

function structuredOnly(ctx) {
  const c = ctx.client;
  // WHO — synthesize bio + sector + tags
  const sectorLine = [c.sector, c.industry].filter(Boolean).join(' / ');
  const whoParts = [];
  if (c.bio) whoParts.push(c.bio);
  else if (sectorLine) whoParts.push(`Works in ${sectorLine}.`);
  if (ctx.tags.length) whoParts.push(`Tagged: ${ctx.tags.slice(0, 5).join(', ')}.`);
  const who = whoParts.join(' ').slice(0, 600) || 'No bio on file.';

  // WHERE WE ARE
  const whereBits = [];
  if (c.intro_status) whereBits.push(`Status: ${c.intro_status}.`);
  if (c.next_step) whereBits.push(`Next step: ${c.next_step}.`);
  if (c.next_followup_at) whereBits.push(`Follow up by ${c.next_followup_at}.`);
  if (c.last_contact_at) whereBits.push(`Last contact: ${c.last_contact_at}.`);
  if (c.cadence_days) whereBits.push(`Cadence: every ${c.cadence_days} days.`);
  if (c.won_value_zar) whereBits.push(`Won value: R ${Number(c.won_value_zar).toLocaleString()}.`);
  if (c.lost_reason) whereBits.push(`Lost reason: ${c.lost_reason}.`);
  const where_we_are = whereBits.join(' ') || 'No pipeline data yet.';

  // TALKING POINTS — from pain points turned into questions
  const talking_points = ctx.pains.slice(0, 5).map(p => {
    const trimmed = String(p).trim();
    if (!trimmed.endsWith('?')) {
      return 'How are you handling ' + trimmed.toLowerCase().replace(/\.$/, '') + ' today?';
    }
    return trimmed;
  });

  // WHAT I CAN OFFER
  const what_i_can_offer = ctx.solutions.slice(0, 4).map(s => {
    const est = s.est_value ? ` (${s.est_value})` : '';
    return `${s.name}${est}${s.why ? ' — ' + s.why : ''}`;
  });

  // OPEN THREADS — open tasks
  const open_threads = ctx.tasks.map(t => {
    const due = t.due_date ? ` (due ${t.due_date})` : '';
    return `${t.title}${due}${t.project_name ? ' [' + t.project_name + ']' : ''}`;
  });

  // NEXT STEP SUGGESTION
  let next_step = c.next_step;
  if (!next_step) {
    if (c.intro_status === 'Not contacted' || !c.intro_status) next_step = 'Make first contact — share the personalised intro brief.';
    else if (c.intro_status === 'Intro sent') next_step = 'Follow up on the intro. Gauge interest, offer a 30-min call.';
    else if (c.intro_status === 'Engaged') next_step = 'Move toward a concrete next step: scoping call, proposal, or pilot.';
    else if (c.intro_status === 'Won') next_step = 'Confirm delivery + check in. Look for expansion or referral.';
    else if (c.intro_status === 'Lost') next_step = 'Re-engage in 3-6 months if conditions change.';
    else next_step = 'Define a clear next step after the call.';
  }

  return {
    who,
    where_we_are,
    talking_points,
    what_i_can_offer,
    open_threads,
    next_step,
    recent_interactions: ctx.interactions.slice(0, 5),
    mode: 'structured',
  };
}

function buildPrompt(ctx) {
  const c = ctx.client;
  const lines = [];
  lines.push('# CLIENT BRIEFING — NgulubeHub Meeting Prep');
  lines.push('');
  lines.push('## Client context');
  lines.push(`Name: ${c.name}`);
  if (c.title) lines.push(`Title: ${c.title}`);
  if (c.company) lines.push(`Company: ${c.company}`);
  if (c.sector) lines.push(`Sector: ${c.sector}${c.industry ? ' / ' + c.industry : ''}${c.sub_industry ? ' / ' + c.sub_industry : ''}`);
  if (c.region) lines.push(`Region: ${c.region}`);
  if (ctx.tags.length) lines.push(`Tags: ${ctx.tags.join(', ')}`);
  if (c.bio) lines.push(`Bio: ${c.bio}`);
  lines.push('');
  lines.push('## Pipeline state');
  lines.push(`Status: ${c.intro_status || 'Not contacted'}`);
  if (c.last_contact_at) lines.push(`Last contact: ${c.last_contact_at}`);
  if (c.next_step) lines.push(`Next step on file: ${c.next_step}`);
  if (c.next_followup_at) lines.push(`Follow up by: ${c.next_followup_at}`);
  if (c.cadence_days) lines.push(`Cadence: every ${c.cadence_days} days`);
  if (c.won_value_zar) lines.push(`Won value: R ${Number(c.won_value_zar).toLocaleString()}`);
  if (c.lost_reason) lines.push(`Lost reason: ${c.lost_reason}`);
  lines.push('');
  if (ctx.focus.length) {
    lines.push('## Focus areas');
    ctx.focus.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }
  if (ctx.pains.length) {
    lines.push('## Pain points (their words)');
    ctx.pains.forEach(p => lines.push(`- ${p}`));
    lines.push('');
  }
  if (ctx.solutions.length) {
    lines.push('## AI solutions we could offer');
    ctx.solutions.forEach(s => {
      const est = s.est_value ? ` [${s.est_value}]` : '';
      lines.push(`- **${s.name}**${est}${s.why ? ' — ' + s.why : ''}`);
    });
    lines.push('');
  }
  if (ctx.interactions.length) {
    lines.push('## Recent interactions (newest first)');
    ctx.interactions.slice(0, 6).forEach(i => {
      lines.push(`- [${i.created_at}] ${i.type}: ${i.summary}`);
    });
    lines.push('');
  }
  if (ctx.tasks.length) {
    lines.push('## Open tasks');
    ctx.tasks.forEach(t => {
      const due = t.due_date ? ' (due ' + t.due_date + ')' : '';
      lines.push(`- ${t.title}${due}${t.priority ? ' [' + t.priority + ']' : ''}`);
    });
    lines.push('');
  }
  lines.push('## Output format (STRICT JSON, no markdown outside)');
  lines.push('Respond with ONLY a JSON object, no prose before or after:');
  lines.push('{');
  lines.push('  "who": "2-3 sentences synthesising who this person is and what they do",');
  lines.push('  "where_we_are": "1-2 sentences on pipeline state and momentum",');
  lines.push('  "talking_points": ["question 1", "question 2", "question 3", "question 4", "question 5"],');
  lines.push('  "what_i_can_offer": ["solution 1 with why it fits them", "solution 2 with why", "solution 3 with why"],');
  lines.push('  "next_step": "one specific, actionable thing to do after this call",');
  lines.push('  "open_threads": ["any unresolved items you noticed", "second open thread"]');
  lines.push('}');
  return lines.join('\n');
}

function tryParseJson(text) {
  // Strip ```json fences if present
  let t = String(text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  }
  // Find the first { and last }
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  try { return JSON.parse(t); } catch (_) { return null; }
}

async function generateAI(ctx) {
  const prompt = buildPrompt(ctx);
  const system = 'You are a sharp, no-fluff sales assistant briefing a consultant before a client call. Be brief, specific, and useful. No corporate speak. Output strict JSON only.';
  const out = await ai.generate(prompt, { system, maxTokens: 1200, temperature: 0.4, feature: 'meeting_prep' });
  const parsed = tryParseJson(out.text);
  if (!parsed) {
    // Couldn't parse — return raw text in the 'who' field so the UI can show it
    return {
      who: out.text,
      where_we_are: '',
      talking_points: [],
      what_i_can_offer: [],
      next_step: '',
      open_threads: [],
      parse_error: true,
      mode: 'ai-raw',
    };
  }
  return {
    who: parsed.who || '',
    where_we_are: parsed.where_we_are || '',
    talking_points: Array.isArray(parsed.talking_points) ? parsed.talking_points : [],
    what_i_can_offer: Array.isArray(parsed.what_i_can_offer) ? parsed.what_i_can_offer : [],
    next_step: parsed.next_step || '',
    open_threads: Array.isArray(parsed.open_threads) ? parsed.open_threads : [],
    mode: 'ai',
  };
}

async function prepFor(clientId, { force = false } = {}) {
  const ctx = buildContext(clientId);
  if (!ctx) return null;

  // Always start with structured so we have SOMETHING to show.
  const baseBrief = structuredOnly(ctx);

  if (force) ai.clearCachedPrep(clientId);

  // Check cache
  const cached = ai.getCachedPrep(clientId);
  if (cached && !force) {
    let parsed;
    try { parsed = JSON.parse(cached.content_json); } catch (_) { parsed = null; }
    if (parsed) {
      return {
        ...baseBrief,
        ...parsed,
        mode: parsed.mode || 'ai-cached',
        cached: true,
        generated_at: cached.generated_at,
        provider_id: cached.provider_id,
        model: cached.model,
      };
    }
  }

  // Try AI
  const hasProvider = !!ai.getDefaultProvider();
  if (!hasProvider) {
    return { ...baseBrief, mode: 'structured', cached: false, has_ai: false };
  }
  try {
    const aiBrief = await generateAI(ctx);
    const merged = { ...baseBrief, ...aiBrief, has_ai: true };
    ai.setCachedPrep(clientId, {
      provider_id: ai.getDefaultProvider().id,
      model: aiBrief.model || 'unknown',
      content: aiBrief,
    });
    return { ...merged, cached: false };
  } catch (e) {
    return { ...baseBrief, mode: 'structured', has_ai: true, ai_error: e.message };
  }
}

module.exports = { buildContext, structuredOnly, buildPrompt, generateAI, prepFor };
