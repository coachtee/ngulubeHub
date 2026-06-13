// server.js — Ngulube Hub: business client database & AI-solution matching system
// Stack: Express + better-sqlite3 + EJS + Bootstrap 5 (CDN) + bcryptjs + express-session.
// Single port, no build.
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db/schema');
const users = require('./db/users');
const projects = require('./db/projects');
const calendar = require('./db/calendar');
const today = require('./db/today');
const importer = require('./db/import');

// Lightweight migrations for live DB upgrades
(function migrate(){
  const cols = db.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
  if (!cols.includes('last_contact_at')) {
    try { db.exec("ALTER TABLE clients ADD COLUMN last_contact_at TEXT"); } catch (_) {}
  }
  if (!cols.includes('cadence_days')) {
    try { db.exec("ALTER TABLE clients ADD COLUMN cadence_days INTEGER"); } catch (_) {}
  }
  if (!cols.includes('next_step')) {
    try { db.exec("ALTER TABLE clients ADD COLUMN next_step TEXT"); } catch (_) {}
  }
  if (!cols.includes('next_followup_at')) {
    try { db.exec("ALTER TABLE clients ADD COLUMN next_followup_at TEXT"); } catch (_) {}
  }
  if (!cols.includes('won_value_zar')) {
    try { db.exec("ALTER TABLE clients ADD COLUMN won_value_zar INTEGER"); } catch (_) {}
  }
  if (!cols.includes('lost_reason')) {
    try { db.exec("ALTER TABLE clients ADD COLUMN lost_reason TEXT"); } catch (_) {}
  }
})();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ngulube-hub-dev-secret-change-me-in-prod';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Custom EJS engine wrapper to avoid the `include` shadowing quirk in some Node versions
app.engine('ejs', function (filePath, options, callback) {
  const ejs = require('ejs');
  ejs.renderFile(filePath, options, { filename: filePath, async: false }, callback);
});

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessions — MUST come before the locals middleware so req.session is available
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

// Make locals available to every template
app.use((req, res, next) => {
  res.locals.title = res.locals.title || 'Ngulube Hub';
  res.locals.currentUser = (req.session && req.session.user) ? req.session.user : null;
  // Alias `user` to currentUser for templates that reference `user` directly
  res.locals.user = res.locals.currentUser;
  res.locals.flash = (req.session && req.session.flash) ? req.session.flash : null;
  if (req.session) req.session.flash = null;
  next();
});

// ---------- auth middleware ----------
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // First-time visitors (no users yet) should land on /setup, not /login
  if (users.countAll() === 0) return res.redirect('/setup');
  if (req.method === 'GET') return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  return res.status(401).send('Login required');
}
function requireSuperadmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'superadmin') return next();
  return res.status(403).send('Super-admin access required');
}
function flash(req, type, message) {
  if (req.session) req.session.flash = { type, message };
}

// ---------- helpers ----------
const safeJson = (s, fb) => { try { return JSON.parse(s || '[]'); } catch (_) { return fb; } };
const fmt = (s) => (s || '').trim();

const loadClient = (id) => {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!c) return null;
  return {
    ...c,
    focus_areas: safeJson(c.focus_areas, []),
    pain_points: safeJson(c.pain_points, []),
    ai_solutions: safeJson(c.ai_solutions, []),
    tags: safeJson(c.tags, []),
  };
};

const loadCatalog = () => db.prepare('SELECT * FROM ai_solutions_catalog ORDER BY category, name').all()
  .map(r => ({ ...r, industries: safeJson(r.industries, []) }));

// ---------- AUTH ROUTES ----------

// First-run setup: if no users exist, redirect to /setup
app.get('/setup', (req, res) => {
  if (users.countAll() > 0) return res.redirect('/login');
  res.render('setup', { error: null, title: 'Welcome — Set up Ngulube Hub' });
});
app.post('/setup', (req, res) => {
  if (users.countAll() > 0) return res.redirect('/login');
  const { username, password, name } = req.body;
  if (!username || !password || !name) {
    return res.render('setup', { error: 'All fields are required.', title: 'Welcome — Set up Ngulube Hub' });
  }
  if (password.length < 6) {
    return res.render('setup', { error: 'Password must be at least 6 characters.', title: 'Welcome — Set up Ngulube Hub' });
  }
  try {
    users.create({ username, password, name, role: 'superadmin' });
    flash(req, 'success', 'Account created. Please log in.');
    res.redirect('/login');
  } catch (e) {
    res.render('setup', { error: 'Could not create account: ' + e.message, title: 'Welcome — Set up Ngulube Hub' });
  }
});

// Login
app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.render('login', { error: null, next: req.query.next || '/', title: 'Sign in — Ngulube Hub' });
});
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const next = req.body.next || '/';
  const user = users.verifyPassword(username, password);
  if (!user) {
    return res.status(401).render('login', { error: 'Invalid username or password.', next, title: 'Sign in — Ngulube Hub' });
  }
  req.session.user = user;
  flash(req, 'success', 'Welcome back, ' + (user.name || user.username) + '.');
  res.redirect(next);
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------- ADMIN (USER MANAGEMENT) ROUTES ----------

app.get('/admin/users', requireAuth, requireSuperadmin, (req, res) => {
  const all = users.listAll();
  res.render('admin-users', { allUsers: all, active: 'users', title: 'Admin Users — Ngulube Hub' });
});

app.post('/admin/users', requireAuth, requireSuperadmin, (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name) {
    flash(req, 'error', 'All fields are required.');
    return res.redirect('/admin/users');
  }
  if (password.length < 6) {
    flash(req, 'error', 'Password must be at least 6 characters.');
    return res.redirect('/admin/users');
  }
  try {
    users.create({ username, password, name, role: role === 'superadmin' ? 'superadmin' : 'admin' });
    flash(req, 'success', 'Admin "' + name + '" created.');
  } catch (e) {
    flash(req, 'error', 'Could not create: ' + e.message);
  }
  res.redirect('/admin/users');
});

app.get('/admin/users/:id/edit', requireAuth, requireSuperadmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = users.getById(id);
  if (!target) {
    flash(req, 'error', 'User not found.');
    return res.redirect('/admin/users');
  }
  res.render('admin-user-edit', { target, active: 'users', title: 'Edit ' + (target.name || target.username) + ' — Ngulube Hub' });
});

app.post('/admin/users/:id/edit', requireAuth, requireSuperadmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, username, role } = req.body;
  try {
    const updated = users.update(id, { name, username, role });
    if (!updated) {
      flash(req, 'error', 'User not found.');
      return res.redirect('/admin/users');
    }
    flash(req, 'success', 'User updated.');
  } catch (e) {
    flash(req, 'error', 'Could not update: ' + e.message);
  }
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/delete', requireAuth, requireSuperadmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.session.user.id) {
    flash(req, 'error', 'You cannot delete yourself.');
    return res.redirect('/admin/users');
  }
  users.remove(id);
  flash(req, 'success', 'Admin removed.');
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/password', requireAuth, requireSuperadmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    flash(req, 'error', 'Password must be at least 6 characters.');
    return res.redirect('/admin/users');
  }
  users.changePassword(id, new_password);
  flash(req, 'success', 'Password updated.');
  res.redirect('/admin/users');
});

// ---------- DASHBOARD ROUTES (all require auth) ----------

// Dashboard routes (both / and /dashboard for backward compat with links)
function dashboardHandler(req, res) {
  const q = (req.query.q || '').trim();
  const sector = (req.query.sector || '').trim();
  const status = (req.query.status || '').trim();

  let sql = 'SELECT * FROM clients';
  const conds = [];
  const args = [];
  if (q) { conds.push('(name LIKE ? OR company LIKE ? OR bio LIKE ? OR focus_areas LIKE ? OR tags LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (sector) { conds.push('sector = ?'); args.push(sector); }
  if (status) { conds.push('intro_status = ?'); args.push(status); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY sector, name';

  const clients = db.prepare(sql).all(...args).map(c => ({
    ...c,
    focus_areas: safeJson(c.focus_areas, []),
    pain_points: safeJson(c.pain_points, []),
    ai_solutions: safeJson(c.ai_solutions, []),
    tags: safeJson(c.tags, []),
  }));

  const sectors = db.prepare("SELECT DISTINCT sector FROM clients WHERE sector IS NOT NULL AND sector != '' ORDER BY sector").all().map(r => r.sector);
  const statuses = ['Not contacted', 'Intro sent', 'Meeting scheduled', 'Engaged', 'Won', 'Lost', 'On hold'];

  const stats = {
    total: clients.length,
    sectors: sectors.length,
    contacted: db.prepare("SELECT COUNT(*) as c FROM clients WHERE intro_status != 'Not contacted'").get().c,
    notContacted: db.prepare("SELECT COUNT(*) as c FROM clients WHERE intro_status = 'Not contacted'").get().c,
    pending: db.prepare("SELECT COUNT(*) as c FROM clients WHERE intro_status = 'Pending review' OR intro_status = 'pending'").get().c,
  };

  // Project + task widgets
  const projectStats = projects.getProjectStatsGlobal();
  const myUpcomingTasks = projects.getUpcomingTasks(req.session.user.id, 7);
  const recentIdeas = db.prepare("SELECT id, name, created_at FROM projects WHERE status = 'concept' AND archived = 0 ORDER BY created_at DESC LIMIT 3").all();
  const activeProjects = db.prepare("SELECT id, name, status, target_end_date, est_value_zar FROM projects WHERE status IN ('active','scoping','quoted') AND archived = 0 ORDER BY updated_at DESC LIMIT 4").all();

  // Today widget (new in feature 3)
  const todayData = today.getToday();

  res.render('dashboard', {
    clients, sectors, statuses, q, sector, status, stats,
    projectStats, myUpcomingTasks, recentIdeas, activeProjects,
    todayData, projects, active: 'dashboard',
  });
}
app.get('/', requireAuth, dashboardHandler);
app.get('/dashboard', requireAuth, dashboardHandler);

// ---------- PIPELINE VIEWS (filter dashboard by intro status) ----------

const PIPELINE_MAP = {
  'not-contacted': { statuses: ['Not contacted'], label: 'Not Contacted', active: 'not_contacted' },
  'intro-sent':    { statuses: ['Intro sent'],    label: 'Intro Sent',    active: 'intro_sent' },
  'engaged':       { statuses: ['Meeting scheduled', 'Engaged', 'Won'], label: 'Engaged / Won', active: 'engaged' },
};

function pipelineHandler(slug) {
  return (req, res) => {
    const cfg = PIPELINE_MAP[slug];
    if (!cfg) return res.status(404).send('Unknown pipeline view');
    const q = (req.query.q || '').trim();
    const placeholders = cfg.statuses.map(() => '?').join(',');
    let sql = `SELECT * FROM clients WHERE intro_status IN (${placeholders})`;
    const args = [...cfg.statuses];
    if (q) { sql += ' AND (name LIKE ? OR company LIKE ? OR bio LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY sector, name';
    const clients = db.prepare(sql).all(...args).map(c => ({
      ...c,
      focus_areas: safeJson(c.focus_areas, []),
      pain_points: safeJson(c.pain_points, []),
      ai_solutions: safeJson(c.ai_solutions, []),
      tags: safeJson(c.tags, []),
    }));
    const sectors = db.prepare("SELECT DISTINCT sector FROM clients WHERE sector IS NOT NULL AND sector != '' ORDER BY sector").all().map(r => r.sector);
    const stats = {
      total: clients.length,
      sectors: new Set(clients.map(c => c.sector).filter(Boolean)).size,
      pending: db.prepare("SELECT COUNT(*) as c FROM clients WHERE intro_status = 'Pending review' OR intro_status = 'pending'").get().c,
    };
    res.render('pipeline', {
      clients, sectors, stats, q,
      pipelineLabel: cfg.label, pipelineActive: cfg.active,
      title: cfg.label + ' — Ngulube Hub',
    });
  };
}
app.get('/pipeline/not-contacted', requireAuth, pipelineHandler('not-contacted'));
app.get('/pipeline/intro-sent',    requireAuth, pipelineHandler('intro-sent'));
app.get('/pipeline/engaged',       requireAuth, pipelineHandler('engaged'));

// Board view (ClickUp-style kanban) — all clients grouped by status
app.get('/board', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = 'SELECT * FROM clients';
  const args = [];
  if (q) {
    sql += ' WHERE name LIKE ? OR company LIKE ? OR bio LIKE ?';
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY name';
  const rows = db.prepare(sql).all(...args).map(c => ({
    ...c,
    focus_areas: safeJson(c.focus_areas, []),
    pain_points: safeJson(c.pain_points, []),
    ai_solutions: safeJson(c.ai_solutions, []),
    tags: safeJson(c.tags, []),
  }));
  // Bucket by status (display labels)
  const STATUSES = ['Not contacted', 'Pending review', 'Intro sent', 'Engaged', 'Won', 'Lost'];
  const buckets = {
    'Not contacted': rows.filter(c => !c.intro_status || c.intro_status === 'Not contacted' || c.intro_status === 'not_contacted'),
    'Pending review': rows.filter(c => c.intro_status === 'Pending review' || c.intro_status === 'pending'),
    'Intro sent': rows.filter(c => c.intro_status === 'Intro sent' || c.intro_status === 'intro_sent'),
    'Engaged': rows.filter(c => c.intro_status === 'Engaged' || c.intro_status === 'engaged'),
    'Won': rows.filter(c => c.intro_status === 'Won' || c.intro_status === 'won'),
    'Lost': rows.filter(c => c.intro_status === 'Lost' || c.intro_status === 'lost'),
  };
  res.render('board', { buckets, statuses: STATUSES, q, active: 'board', title: 'Board — NgulubeHub' });
});

// Drag-and-drop: update client status from board
app.post('/clients/:id/status', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const newStatus = (req.body.status || '').trim();
  const ALLOWED = ['Not contacted', 'Pending review', 'Intro sent', 'Engaged', 'Won', 'Lost'];
  if (!ALLOWED.includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });
  const before = db.prepare('SELECT intro_status FROM clients WHERE id = ?').get(id);
  if (!before) return res.status(404).json({ error: 'Not found' });
  if (before.intro_status === newStatus) return res.json({ ok: true, noop: true });
  db.prepare("UPDATE clients SET intro_status = ?, last_contact_at = CASE WHEN ? IN ('Engaged', 'Won', 'Intro sent') THEN DATE('now') ELSE last_contact_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newStatus, newStatus, id);
  // Log to interactions timeline
  db.prepare('INSERT INTO interactions (client_id, type, summary) VALUES (?, ?, ?)').run(
    id, 'status', `Status changed: ${before.intro_status || 'Not contacted'} → ${newStatus}`
  );
  // Flash a friendly message for the user
  flash(req, 'success', `Moved to ${newStatus}.`);
  res.json({ ok: true, status: newStatus });
});

app.get('/clients/new', requireAuth, (req, res) => {
  const sectors = ['Finance', 'Banking', 'Insurance', 'Healthcare', 'IT Services', 'Cybersecurity', 'Construction', 'Engineering', 'Architecture', 'Creative', 'Marketing', 'Real Estate', 'HR Services', 'Telecommunications', 'Accounting', 'Fashion', 'Energy', 'Education', 'Other'];
  res.render('form', { client: null, sectors, error: null, active: 'add', title: 'Add Client — Ngulube Hub' });
});

app.get('/clients/:id', requireAuth, (req, res) => {
  const c = loadClient(req.params.id);
  if (!c) return res.status(404).send('Client not found');
  const interactions = db.prepare('SELECT * FROM interactions WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
  const atts = attachments.listForClient(c.id);
  res.render('profile', { client: c, interactions, attachments: atts, active: 'dashboard' });
});

// Global Cmd+K search across clients, projects, tasks
app.get('/api/search', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 1) return res.json({ clients: [], projects: [], tasks: [] });
  const like = `%${q}%`;
  const clients = db.prepare(`
    SELECT id, name, company, sector, intro_status FROM clients
    WHERE name LIKE ? OR company LIKE ? OR bio LIKE ? OR sector LIKE ? OR industry LIKE ? OR tags LIKE ?
    ORDER BY name LIMIT 8
  `).all(like, like, like, like, like, like);
  const projects = db.prepare(`
    SELECT id, name, status FROM projects
    WHERE name LIKE ? OR description LIKE ? ORDER BY name LIMIT 5
  `).all(like, like);
  const tasks = db.prepare(`
    SELECT t.id, t.title, t.priority, t.due_date, t.status, p.name AS project_name
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.title LIKE ? ORDER BY t.due_date ASC LIMIT 5
  `).all(like);
  res.json({ clients, projects, tasks });
});

app.post('/clients', requireAuth, (req, res) => {
  try {
    const b = req.body;
    const insert = db.prepare(`
      INSERT INTO clients (name, title, company, website, sector, industry, sub_industry, bio,
        focus_areas, pain_points, ai_solutions, tags, contact_email, contact_phone,
        intro_status, source, notes, region, last_contact_at, cadence_days)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const result = insert.run(
      fmt(b.name), fmt(b.title), fmt(b.company), fmt(b.website),
      fmt(b.sector), fmt(b.industry), fmt(b.sub_industry), fmt(b.bio),
      JSON.stringify((b.focus_areas || '').split('\n').map(s => s.trim()).filter(Boolean)),
      JSON.stringify((b.pain_points || '').split('\n').map(s => s.trim()).filter(Boolean)),
      JSON.stringify(suggestSolutionsFor(b.sector, b.industry)),
      JSON.stringify((b.tags || '').split(',').map(s => s.trim()).filter(Boolean)),
      fmt(b.contact_email), fmt(b.contact_phone),
      fmt(b.intro_status) || 'Not contacted',
      fmt(b.source) || 'Direct add',
      fmt(b.notes),
      fmt(b.region) || 'South Africa',
      b.last_contact_at || null,
      b.cadence_days ? parseInt(b.cadence_days) : null,
    );
    res.redirect(`/clients/${result.lastInsertRowid}`);
  } catch (e) {
    const sectors = ['Finance', 'Banking', 'Insurance', 'Healthcare', 'IT Services', 'Cybersecurity', 'Construction', 'Engineering', 'Architecture', 'Creative', 'Marketing', 'Real Estate', 'HR Services', 'Telecommunications', 'Accounting', 'Fashion', 'Energy', 'Education', 'Other'];
    res.status(400).render('form', { client: null, sectors, error: e.message, active: 'add', title: 'Add Client — Ngulube Hub' });
  }
});

app.get('/clients/:id/edit', requireAuth, (req, res) => {
  const c = loadClient(req.params.id);
  if (!c) return res.status(404).send('Client not found');
  const sectors = ['Finance', 'Banking', 'Insurance', 'Healthcare', 'IT Services', 'Cybersecurity', 'Construction', 'Engineering', 'Architecture', 'Creative', 'Marketing', 'Real Estate', 'HR Services', 'Telecommunications', 'Accounting', 'Fashion', 'Energy', 'Education', 'Other'];
  res.render('form', { client: c, sectors, error: null, active: 'dashboard', title: 'Edit ' + c.name + ' — Ngulube Hub' });
});

app.post('/clients/:id', requireAuth, (req, res) => {
  try {
    const b = req.body;
    const update = db.prepare(`
      UPDATE clients SET
        name=?, title=?, company=?, website=?, sector=?, industry=?, sub_industry=?, bio=?,
        focus_areas=?, pain_points=?, ai_solutions=?, tags=?, contact_email=?, contact_phone=?,
        intro_status=?, source=?, notes=?, region=?, last_contact_at=?, cadence_days=?,
        next_step=?, next_followup_at=?, won_value_zar=?, lost_reason=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `);
    update.run(
      fmt(b.name), fmt(b.title), fmt(b.company), fmt(b.website),
      fmt(b.sector), fmt(b.industry), fmt(b.sub_industry), fmt(b.bio),
      JSON.stringify((b.focus_areas || '').split('\n').map(s => s.trim()).filter(Boolean)),
      JSON.stringify((b.pain_points || '').split('\n').map(s => s.trim()).filter(Boolean)),
      (() => {
        const existing = loadClient(req.params.id);
        return existing ? JSON.stringify(existing.ai_solutions) : JSON.stringify([]);
      })(),
      JSON.stringify((b.tags || '').split(',').map(s => s.trim()).filter(Boolean)),
      fmt(b.contact_email), fmt(b.contact_phone),
      fmt(b.intro_status) || 'Not contacted',
      fmt(b.source),
      fmt(b.notes),
      fmt(b.region) || 'South Africa',
      b.last_contact_at || null,
      b.cadence_days ? parseInt(b.cadence_days) : null,
      fmt(b.next_step) || null,
      b.next_followup_at || null,
      b.won_value_zar ? parseInt(b.won_value_zar) : null,
      fmt(b.lost_reason) || null,
      req.params.id,
    );
    res.redirect(`/clients/${req.params.id}`);
  } catch (e) {
    res.status(400).send('Update failed: ' + e.message);
  }
});

app.post('/clients/:id/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  flash(req, 'success', 'Client removed.');
  res.redirect('/');
});

// ---------- FILE ATTACHMENTS ----------
// Tiny multipart parser (no external dep). Handles single file per request,
// with form fields available as req.body. Limited to 10 MB uploads.
const fs = require('fs');
const attachments = require('./db/attachments');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ctype = req.headers['content-type'] || '';
    const m = ctype.match(/^multipart\/form-data;\s*boundary=(.+)$/);
    if (!m) return reject(new Error('Not multipart'));
    const boundary = '--' + m[1];
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > MAX_UPLOAD_BYTES + 1024) {
        req.destroy();
        return reject(new Error('Upload too large'));
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const fields = {};
        const files = [];
        let pos = 0;
        while (pos < buf.length) {
          const start = buf.indexOf(boundary, pos);
          if (start === -1) break;
          pos = start + boundary.length;
          // Expect \r\n after boundary
          if (buf.slice(pos, pos + 2).toString() === '--') break; // end
          if (buf.slice(pos, pos + 2).toString() === '\r\n') pos += 2;
          // Find the part headers end (\r\n\r\n)
          const headerEnd = buf.indexOf('\r\n\r\n', pos);
          if (headerEnd === -1) break;
          const headerText = buf.slice(pos, headerEnd).toString();
          pos = headerEnd + 4;
          // Find the closing boundary for this part
          const partEnd = buf.indexOf('\r\n' + boundary, pos);
          if (partEnd === -1) break;
          const partBody = buf.slice(pos, partEnd);
          pos = partEnd + 2;
          // Parse Content-Disposition
          const cd = headerText.match(/Content-Disposition:[^\n]*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
          if (!cd) continue;
          const name = cd[1];
          const filename = cd[2];
          if (filename) {
            // File part
            const ft = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
            files.push({
              fieldName: name,
              originalName: filename,
              mimeType: ft ? ft[1].trim() : 'application/octet-stream',
              buffer: partBody,
            });
          } else {
            // Field part
            fields[name] = partBody.toString('utf8');
          }
        }
        resolve({ fields, files });
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

app.post('/clients/:id/attachments', requireAuth, async (req, res) => {
  const clientId = parseInt(req.params.id, 10);
  const c = loadClient(clientId);
  if (!c) return res.status(404).send('Client not found');
  try {
    const { files } = await parseMultipart(req);
    if (!files.length) {
      flash(req, 'error', 'No file uploaded.');
      return res.redirect(`/clients/${clientId}`);
    }
    for (const f of files) {
      if (f.buffer.length > MAX_UPLOAD_BYTES) {
        flash(req, 'error', `File "${f.originalName}" exceeds 10 MB.`);
        continue;
      }
      const storedPath = attachments.saveBuffer(clientId, f.originalName, f.buffer);
      attachments.add(clientId, {
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.buffer.length,
        storedPath,
      });
    }
    flash(req, 'success', `Uploaded ${files.length} file${files.length === 1 ? '' : 's'}.`);
    res.redirect(`/clients/${clientId}`);
  } catch (e) {
    flash(req, 'error', 'Upload failed: ' + e.message);
    res.redirect(`/clients/${clientId}`);
  }
});

app.get('/attachments/:id/download', requireAuth, (req, res) => {
  const att = attachments.getById(req.params.id);
  if (!att) return res.status(404).send('Attachment not found');
  if (!fs.existsSync(att.storage_path)) return res.status(404).send('File missing on disk');
  res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
  // RFC 5987 for non-ASCII filenames
  const asciiName = att.original_name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  const utf8Name = encodeURIComponent(att.original_name);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`);
  res.sendFile(path.resolve(att.storage_path));
});

app.post('/attachments/:id/delete', requireAuth, (req, res) => {
  const att = attachments.getById(req.params.id);
  if (!att) { flash(req, 'error', 'Attachment not found.'); return res.redirect('/'); }
  const clientId = att.client_id;
  attachments.remove(att.id);
  flash(req, 'success', 'Attachment removed.');
  res.redirect(`/clients/${clientId}`);
});

app.post('/clients/:id/interactions', requireAuth, (req, res) => {
  const b = req.body;
  db.prepare('INSERT INTO interactions (client_id, type, summary) VALUES (?, ?, ?)').run(
    req.params.id, fmt(b.type) || 'note', fmt(b.summary),
  );
  // Auto-update last_contact_at so the calendar cadence stays current
  db.prepare('UPDATE clients SET last_contact_at = COALESCE(DATE("now"), DATE("now")) WHERE id = ?').run(req.params.id);
  if (b.new_status) {
    db.prepare('UPDATE clients SET intro_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(fmt(b.new_status), req.params.id);
  }
  res.redirect(`/clients/${req.params.id}#interactions`);
});

app.get('/clients/:id/intro', requireAuth, (req, res) => {
  const c = loadClient(req.params.id);
  if (!c) return res.status(404).send('Client not found');
  const matches = matchCatalog(c);
  const totalLow = matches.reduce((s, m) => s + parseZAR(m.est_value).low, 0);
  const totalHigh = matches.reduce((s, m) => s + parseZAR(m.est_value).high, 0);
  const firstName = c.name.split(' ')[0];
  const hook = sectorHook(c);
  res.render('intro', {
    client: c, matches, firstName, hook, totalLow, totalHigh,
    generatedAt: new Date().toISOString().slice(0, 10),
    title: 'Intro Brief — ' + c.name,
  });
});

app.post('/clients/:id/mark-intro-sent', requireAuth, (req, res) => {
  db.prepare('UPDATE clients SET intro_status = ?, last_contact_at = DATE("now"), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('Intro sent', req.params.id);
  db.prepare('INSERT INTO interactions (client_id, type, summary) VALUES (?, ?, ?)').run(req.params.id, 'intro_sent', 'Intro brief generated and sent');
  flash(req, 'success', 'Marked as intro sent.');
  res.redirect(`/clients/${req.params.id}`);
});

// Approve a self-submitted /join lead: move it from 'pending' to 'Not contacted'
// and log an activity so the timeline shows the admin's decision.
app.post('/clients/:id/approve-pending', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!c) return res.status(404).send('Client not found');
  db.prepare('UPDATE clients SET intro_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('Not contacted', id);
  db.prepare(`INSERT INTO interactions (client_id, type, summary, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, 'System', 'Approved self-submission from /join and added to pipeline as Not contacted.', new Date().toISOString());
  res.redirect('/clients/' + id);
});

app.get('/catalog', requireAuth, (req, res) => {
  const catalog = loadCatalog();
  res.render('catalog', { catalog, active: 'catalog', title: 'AI Solutions Catalog — Ngulube Hub' });
});

app.get('/catalog.json', requireAuth, (req, res) => res.json(loadCatalog()));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now(), users: users.countAll() }));

// =============================================================
// PROJECT MANAGEMENT MODULE
// =============================================================

// Quick "drop an idea" — creates a concept project from a single field.
app.post('/ideas', requireAuth, (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.redirect('/dashboard?err=missing_title');
  const id = projects.createProject({
    name: title,
    description: req.body.description || null,
    owner_id: req.session.user.id,
    status: 'concept',
  }, req.session.user.id);
  res.redirect('/projects/' + id);
});

// ---------- PROJECT PAGES ----------

app.get('/projects', requireAuth, (req, res) => {
  const view = req.query.view || 'kanban';
  const search = (req.query.q || '').trim();
  const status = req.query.status || null;
  const allProjects = projects.getProjects({ status, search, archived: 0 });
  const grouped = projects.getProjectsByStatus();
  const stats = projects.getProjectStatsGlobal();
  const allUsers = users.listAll();
  const allClients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();
  res.render('projects/index', {
    title: 'Projects — Ngulube Hub',
    active: 'projects',
    view, search, status, allProjects, grouped, stats, allUsers, allClients,
    projects,
  });
});

app.get('/projects/new', requireAuth, (req, res) => {
  const allUsers = users.listAll();
  const allClients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();
  res.render('projects/form', {
    title: 'New Project — Ngulube Hub',
    active: 'projects',
    project: null, allUsers, allClients, projects,
  });
});

app.post('/projects', requireAuth, (req, res) => {
  const id = projects.createProject(req.body, req.session.user.id);
  res.redirect('/projects/' + id);
});

app.get('/projects/:id', requireAuth, (req, res) => {
  const p = projects.getProjectWithDetails(req.params.id);
  if (!p) return res.status(404).send('Project not found');
  const allUsers = users.listAll();
  const allClients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();
  res.render('projects/detail', {
    title: p.name + ' — Ngulube Hub',
    active: 'projects',
    project: p, allUsers, allClients, projects,
  });
});

app.get('/projects/:id/edit', requireAuth, (req, res) => {
  const p = projects.getProject(req.params.id);
  if (!p) return res.status(404).send('Project not found');
  const allUsers = users.listAll();
  const allClients = db.prepare("SELECT id, name, company FROM clients ORDER BY name").all();
  res.render('projects/form', {
    title: 'Edit ' + p.name + ' — Ngulube Hub',
    active: 'projects',
    project: p, allUsers, allClients, projects,
  });
});

app.post('/projects/:id', requireAuth, (req, res) => {
  projects.updateProject(req.params.id, req.body, req.session.user.id);
  res.redirect('/projects/' + req.params.id);
});

app.post('/projects/:id/status', requireAuth, (req, res) => {
  const newStatus = req.body.status;
  if (!projects.PROJECT_STATUSES.includes(newStatus)) return res.status(400).send('Bad status');
  const p = projects.getProject(req.params.id);
  if (!p) return res.status(404).send('Not found');
  projects.updateProject(req.params.id, { ...p, status: newStatus }, req.session.user.id);
  const back = req.body.back || ('/projects/' + req.params.id);
  res.redirect(back);
});

app.post('/projects/:id/archive', requireAuth, (req, res) => {
  projects.archiveProject(req.params.id, req.session.user.id);
  res.redirect('/projects');
});

app.post('/projects/:id/delete', requireAuth, (req, res) => {
  projects.deleteProject(req.params.id);
  res.redirect('/projects');
});

// ---------- TASKS ----------

app.post('/projects/:id/tasks', requireAuth, (req, res) => {
  projects.createTask({ ...req.body, project_id: req.params.id }, req.session.user.id);
  const back = req.body.back || ('/projects/' + req.params.id);
  res.redirect(back);
});

app.post('/tasks/:tid/status', requireAuth, (req, res) => {
  const t = projects.getTask(req.params.tid);
  if (!t) return res.status(404).send('Task not found');
  const newStatus = req.body.status;
  if (!projects.TASK_STATUSES.includes(newStatus)) return res.status(400).send('Bad status');
  projects.updateTask(req.params.tid, { ...t, status: newStatus }, req.session.user.id);
  const back = req.body.back || ('/projects/' + t.project_id);
  res.redirect(back);
});

app.post('/tasks/:tid', requireAuth, (req, res) => {
  const t = projects.getTask(req.params.tid);
  if (!t) return res.status(404).send('Task not found');
  projects.updateTask(req.params.tid, { ...t, ...req.body }, req.session.user.id);
  const back = req.body.back || ('/projects/' + t.project_id);
  res.redirect(back);
});

app.post('/tasks/:tid/comments', requireAuth, (req, res) => {
  const body = (req.body.body || '').trim();
  if (body) projects.addComment(req.params.tid, req.session.user.id, body);
  const back = req.body.back || ('/projects/');
  res.redirect(back);
});

app.post('/tasks/:tid/delete', requireAuth, (req, res) => {
  const t = projects.getTask(req.params.tid);
  if (!t) return res.status(404).send('Task not found');
  projects.deleteTask(req.params.tid, req.session.user.id);
  const back = req.body.back || ('/projects/' + t.project_id);
  res.redirect(back);
});

// ---------- MY TASKS ----------

app.get('/tasks', requireAuth, (req, res) => {
  const myTasks = projects.getMyTasks(req.session.user.id);
  const upcoming = projects.getUpcomingTasks(req.session.user.id, 7);
  res.render('projects/my-tasks', {
    title: 'My Tasks — Ngulube Hub',
    active: 'tasks',
    myTasks, upcoming,
  });
});

// ---------- CALENDAR ----------
app.get('/calendar', requireAuth, (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.y) || now.getFullYear();
  const month = parseInt(req.query.m) || now.getMonth() + 1;
  const events = calendar.getEventsForMonth(year, month);
  const upcomingTouches = calendar.getUpcomingTouches(5);
  res.render('calendar', {
    title: 'Calendar — Ngulube Hub',
    active: 'calendar',
    year, month, events, upcomingTouches,
  });
});

// ---------- CSV IMPORT ----------
app.get('/import', requireAuth, (req, res) => {
  res.render('import', { title: 'Import clients — Ngulube Hub', active: 'dashboard' });
});
app.post('/import', requireAuth, (req, res) => {
  try {
    const csv = (req.body.csv || '').trim();
    if (!csv) {
      return res.status(400).render('import', { title: 'Import clients — Ngulube Hub', active: 'dashboard', error: 'Paste your CSV first.' });
    }
    const result = importer.processCSV(csv);
    res.render('import', { title: 'Import clients — Ngulube Hub', active: 'dashboard', result });
  } catch (e) {
    res.status(500).render('import', { title: 'Import clients — Ngulube Hub', active: 'dashboard', error: e.message });
  }
});

// ---------- PUBLIC JOIN FORM (no login required) ----------

// GET /join — public form for someone to submit themselves into the network
app.get('/join', (req, res) => {
  res.render('join', { title: 'Join the Network — Ngulube Hub' });
});

// POST /join — save into clients with status 'Pending review', source 'Self-submitted via /join'
app.post('/join', (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  const phone = (b.phone || '').trim();
  const email = (b.email || '').trim();
  const company = (b.company || '').trim();
  const sector = (b.sector || '').trim();
  const industry = (b.industry || '').trim();
  const bio = (b.bio || '').trim();
  const ideal = (b.ideal_client || '').trim();
  const url = (b.url || '').trim();
  const referrer = (b.referrer || '').trim();

  // Validate
  if (!name || !phone || !email || !company || !sector || !industry || !bio || !ideal) {
    return res.status(400).render('join', {
      title: 'Join the Network — Ngulube Hub',
      error: 'Please fill in every required field.',
    });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).render('join', {
      title: 'Join the Network — Ngulube Hub',
      error: 'That email doesn\'t look right. Please check and try again.',
    });
  }

  // Compose a notes blob with the free-text fields we don't have columns for
  const notes =
    `Self-submitted via /join\n` +
    `Submitted: ${new Date().toISOString()}\n` +
    `Phone: ${phone}\n` +
    (url ? `URL: ${url}\n` : '') +
    (referrer ? `Referrer: ${referrer}\n` : '') +
    `\nBio:\n${bio}\n\nIdeal client / partner:\n${ideal}\n`;

  try {
    db.prepare(`INSERT INTO clients
      (name, company, contact_email, sector, industry, bio, intro_status, source, notes, region, focus_areas, pain_points, ai_solutions, tags, created_at, updated_at)
      VALUES
      (?, ?, ?, ?, ?, ?, 'pending', 'Self-submitted via /join', ?, ?, '[]', '[]', '[]', '["self-submitted"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(name, company, email, sector, industry, bio, notes, 'ZA');
  } catch (err) {
    console.error('[/join] insert failed:', err.message);
    return res.status(500).render('join', {
      title: 'Join the Network — Ngulube Hub',
      error: 'Something went wrong saving your details. Please try again or WhatsApp us.',
    });
  }

  // Log activity so the admin sees the new pending lead
  res.render('join', { title: 'Thanks — Ngulube Hub', success: true });
});


// ---------- MATCHING + HELPERS ----------

function parseZAR(s) {
  if (!s) return { low: 0, high: 0 };
  const matches = [...s.toLowerCase().matchAll(/zar\s*(\d+(?:\.\d+)?)\s*k/g)];
  if (matches.length === 0) {
    const rands = [...s.toLowerCase().matchAll(/zar\s*(\d+(?:\.\d+)?)(?!\s*k)/g)].map(m => parseFloat(m[1]) * 1000);
    if (rands.length) {
      const lo = Math.min(...rands), hi = Math.max(...rands);
      return { low: lo, high: hi };
    }
    return { low: 0, high: 0 };
  }
  const vals = matches.map(m => parseFloat(m[1]) * 1000);
  return { low: Math.min(...vals), high: Math.max(...vals) };
}

function matchCatalog(client) {
  const cat = loadCatalog();
  const s = (client.sector || '').toLowerCase();
  const ind = (client.industry || '').toLowerCase();
  const sub = (client.sub_industry || '').toLowerCase();
  const hay = (s + ' ' + ind + ' ' + sub).trim();
  const scored = cat.map(c => {
    const inds = (c.industries || []).map(x => x.toLowerCase());
    let score = 0;
    for (const t of inds) {
      if (hay.includes(t)) score += 3;
      else if (t.split(' ').some(w => w.length > 3 && hay.includes(w))) score += 1;
    }
    if (inds.includes('all sectors')) score += 0.5;
    return { c, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(x => x.c);
  if (scored.length === 0 && client.ai_solutions && client.ai_solutions.length) {
    return client.ai_solutions.map(a => ({ name: a.name, category: 'Custom', description: a.why, industries: [], est_value: a.est_value }));
  }
  return scored;
}

function suggestSolutionsFor(sector, industry) {
  if (!sector && !industry) return [];
  const cat = loadCatalog();
  const hay = ((sector || '') + ' ' + (industry || '')).toLowerCase();
  return cat.filter(c => (c.industries || []).some(i => hay.includes(i.toLowerCase())))
    .slice(0, 4)
    .map(c => ({ name: c.name, why: 'Suggested based on sector/industry match.', est_value: 'Quote on request' }));
}

function sectorHook(c) {
  const s = (c.sector || '').toLowerCase();
  if (s.includes('finance') || s.includes('banking') || s.includes('insurance')) return 'Finance leaders we work with tell us the same thing: "we have the data, we just can\'t move fast enough on it." We help you move faster without losing control.';
  if (s.includes('health') || s.includes('medical')) return 'Healthcare is one of the highest-leverage places to apply AI right now — not to replace clinicians, but to give them back hours every week.';
  if (s.includes('it') || s.includes('cyber')) return 'IT and security teams are stretched thin. Our AI solutions are built by engineers who\'ve lived that — and they plug into the tools you already use.';
  if (s.includes('construction') || s.includes('engineer') || s.includes('architect')) return 'Built-environment firms we work with keep telling us: "we\'re winning more bids, but our delivery teams are buckling." AI is how you scale delivery without scaling headcount.';
  if (s.includes('creative') || s.includes('fashion') || s.includes('marketing')) return 'Creative teams are using AI not to lose their voice, but to multiply it — 3-5x output without burning out the team.';
  if (s.includes('real estate')) return 'Real estate is a relationship + paperwork business — and AI shines at exactly those two things.';
  if (s.includes('hr')) return 'HR and labour leaders are sitting on a massive opportunity: turning the questions you answer 100 times a month into a 24/7 assistant.';
  if (s.includes('telecom')) return 'Telecoms operators are running on data they can\'t fully see. Our AI solutions are built for revenue assurance, fraud, and assurance at telco scale.';
  if (s.includes('accounting')) return 'CA practices we work with are using AI to take the 70% repetitive work off senior staff and put it back into advisory time.';
  return 'We work with leaders in your space to turn AI from a buzzword into line-item business value. The work we do is pragmatic, fast, and tied to outcomes.';
}

// ---------- start ----------
app.listen(PORT, HOST, () => {
  console.log(`✅ Ngulube Hub running at http://${HOST}:${PORT}`);
  console.log(`📂 DB: ${path.join(__dirname, 'data', 'ngulubehub.sqlite')}`);
  console.log(`👤 Users: ${users.countAll()} (${users.countAll() === 0 ? 'setup required — visit /setup' : 'OK'})`);
});
