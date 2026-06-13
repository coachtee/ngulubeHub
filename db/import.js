// db/import.js — CSV import for bulk client creation.
// Accepts pasted CSV text, parses it, validates rows, and inserts.

const db = require('./schema');

// Tiny CSV parser — handles quoted fields, escaped quotes, commas inside quotes.
// For our purposes, no multi-line fields, no BOM.
function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  text = text.replace(/^\uFEFF/, ''); // strip BOM
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      row.push(field); field = '';
      if (row.length > 1 || row.some(f => f !== '')) rows.push(row);
      row = [];
      if (c === '\r' && text[i+1] === '\n') i += 2; else i++;
      continue;
    }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const REQUIRED_COLS = ['name'];
const ALLOWED_COLS = [
  'name', 'title', 'company', 'website', 'email', 'phone', 'sector', 'industry',
  'sub_industry', 'region', 'bio', 'focus_areas', 'pain_points', 'tags',
  'source', 'notes', 'cadence_days', 'last_contact_at'
];
const ALIASES = {
  'email': 'contact_email', 'phone': 'contact_phone',
  'focus areas': 'focus_areas', 'focus_areas': 'focus_areas',
  'pain points': 'pain_points', 'pain_points': 'pain_points',
  'tag': 'tags', 'tags': 'tags',
};

function processCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { inserted: 0, skipped: 0, errors: ['CSV must have at least a header row and one data row.'] };

  const header = rows[0].map(h => (h || '').trim().toLowerCase());
  // Validate required columns
  for (const req of REQUIRED_COLS) {
    if (!header.includes(req)) {
      return { inserted: 0, skipped: 0, errors: [`Missing required column: "${req}"`] };
    }
  }
  // Map columns: 'Email' -> 'contact_email'
  const colMap = header.map(h => ALIASES[h] || h);
  // Validate allowed cols
  const unknown = colMap.filter(c => c && !ALLOWED_COLS.includes(c) && c !== 'contact_email' && c !== 'contact_phone');
  if (unknown.length) {
    return { inserted: 0, skipped: 0, errors: [`Unknown columns: ${unknown.join(', ')}. Allowed: ${ALLOWED_COLS.join(', ')}`] };
  }

  const errors = [];
  let inserted = 0;
  let skipped = 0;

  const insert = db.prepare(`
    INSERT INTO clients
      (name, title, company, website, contact_email, contact_phone,
       sector, industry, sub_industry, region, bio,
       focus_areas, pain_points, ai_solutions, tags,
       intro_status, source, notes, last_contact_at, cadence_days)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 1 && !row[0].trim()) continue; // blank line
    if (row.length < header.length) {
      errors.push(`Row ${r + 1}: has ${row.length} columns, expected ${header.length}.`);
      skipped++;
      continue;
    }
    const d = {};
    for (let c = 0; c < header.length; c++) {
      d[colMap[c]] = (row[c] || '').trim();
    }
    if (!d.name) {
      errors.push(`Row ${r + 1}: missing required field 'name'.`);
      skipped++;
      continue;
    }
    // Process multi-line fields
    if (d.focus_areas) d.focus_areas = JSON.stringify(d.focus_areas.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
    else d.focus_areas = '[]';
    if (d.pain_points) d.pain_points = JSON.stringify(d.pain_points.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
    else d.pain_points = '[]';
    if (d.tags) d.tags = JSON.stringify(d.tags.split(',').map(s => s.trim()).filter(Boolean));
    else d.tags = '[]';
    d.ai_solutions = '[]';
    d.intro_status = 'Not contacted';
    if (d.cadence_days) {
      const cd = parseInt(d.cadence_days);
      if (isNaN(cd) || cd < 0) { errors.push(`Row ${r + 1}: invalid cadence_days "${d.cadence_days}".`); skipped++; continue; }
      d.cadence_days = cd;
    } else {
      d.cadence_days = null;
    }
    if (d.region && d.region.toLowerCase() === 'southafrica') d.region = 'South Africa';

    try {
      insert.run(
        d.name, d.title || null, d.company || null, d.website || null,
        d.contact_email || null, d.contact_phone || null,
        d.sector || null, d.industry || null, d.sub_industry || null, d.region || 'South Africa', d.bio || null,
        d.focus_areas, d.pain_points, d.ai_solutions, d.tags,
        d.intro_status, d.source || 'CSV import', d.notes || null,
        d.last_contact_at || null, d.cadence_days,
      );
      inserted++;
    } catch (e) {
      errors.push(`Row ${r + 1}: ${e.message}`);
      skipped++;
    }
  }

  return { inserted, skipped, errors };
}

module.exports = { parseCSV, processCSV };
