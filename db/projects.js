// db/projects.js — Project Management module schema
// Linear-inspired: minimal, fast, opinionated. PMBOK project charter fields
// for the heavy lifting at the project level.
//
// Tables:
//   projects         - the top-level container
//   tasks            - work items within a project
//   task_comments    - threaded comments on tasks
//   project_members  - who's working on what project (with role)
//   time_entries     - optional lightweight time tracking
//   project_activity - auto-logged event timeline (status changes, etc.)

const db = require('./schema');

const PROJECT_STATUSES = ['concept', 'scoping', 'quoted', 'active', 'on_hold', 'closed_won', 'closed_lost'];
const PROJECT_STATUS_LABELS = {
  concept: 'Concept',
  scoping: 'Scoping',
  quoted: 'Quoted',
  active: 'Active',
  on_hold: 'On Hold',
  closed_won: 'Closed (Won)',
  closed_lost: 'Closed (Lost)',
};
const PROJECT_STATUS_COLORS = {
  concept: 'gray', scoping: 'yellow', quoted: 'blue', active: 'green',
  on_hold: 'orange', closed_won: 'green', closed_lost: 'red',
};
const PROJECT_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done', 'cancelled'];
const TASK_STATUS_LABELS = { todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done', cancelled: 'Cancelled' };
const TASK_STATUS_COLORS = { todo: 'gray', doing: 'blue', blocked: 'red', done: 'green', cancelled: 'gray' };

const KANBAN_COLUMNS = [
  { id: 'concept', title: 'Concept', color: 'gray' },
  { id: 'scoping', title: 'Scoping', color: 'yellow' },
  { id: 'quoted', title: 'Quoted', color: 'blue' },
  { id: 'active', title: 'Active', color: 'green' },
];

// ---------- MIGRATION ----------
// Idempotent — safe to run on every boot.
function ensureSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    problem TEXT,                       -- the "why" of the project
    success_criteria TEXT,              -- the "what does done look like"
    client_id INTEGER,                  -- nullable: standalone ideas allowed
    owner_id INTEGER NOT NULL,          -- FK users.id
    status TEXT NOT NULL DEFAULT 'concept',
    priority TEXT NOT NULL DEFAULT 'normal',
    start_date TEXT,
    target_end_date TEXT,
    actual_end_date TEXT,
    est_value_zar INTEGER DEFAULT 0,
    est_hours INTEGER DEFAULT 0,
    risk_level TEXT DEFAULT 'low',      -- low | medium | high
    risks TEXT,                         -- freeform "biggest 3 risks"
    tags TEXT NOT NULL DEFAULT '[]',    -- JSON array
    color TEXT,                         -- optional project color
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    parent_task_id INTEGER,             -- sub-tasks (one level deep)
    title TEXT NOT NULL,
    description TEXT,                   -- the deliverable
    assignee_id INTEGER,                -- FK users.id
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'normal',
    due_date TEXT,
    estimated_hours REAL,
    actual_hours REAL,
    blocked_reason TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    author_id INTEGER,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'contributor',  -- owner | lead | contributor | viewer
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    hours REAL NOT NULL,
    notes TEXT,
    logged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    actor_id INTEGER,                   -- FK users.id (null for system)
    type TEXT NOT NULL,                 -- created | status_changed | task_added | task_done | comment | note
    summary TEXT NOT NULL,
    meta TEXT,                          -- JSON blob
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
  CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
  CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
  CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived);
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
  CREATE INDEX IF NOT EXISTS idx_project_activity_project ON project_activity(project_id);
  `);
}

// Run on import
ensureSchema();

// ---------- HELPERS ----------

function getProject(id) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!p) return null;
  return hydrateProject(p);
}

function getProjectWithDetails(id) {
  const p = getProject(id);
  if (!p) return null;
  p.tasks = getTasksForProject(id);
  p.members = getProjectMembers(id);
  p.activity = getProjectActivity(id, 50);
  p.stats = getProjectStats(id);
  return p;
}

function hydrateProject(p) {
  return {
    ...p,
    tags: safeJson(p.tags, []),
    archived: !!p.archived,
  };
}

function getProjects({ status, client_id, owner_id, archived = 0, search } = {}) {
  let sql = 'SELECT * FROM projects WHERE archived = ?';
  const args = [archived ? 1 : 0];
  if (status) { sql += ' AND status = ?'; args.push(status); }
  if (client_id) { sql += ' AND client_id = ?'; args.push(client_id); }
  if (owner_id) { sql += ' AND owner_id = ?'; args.push(owner_id); }
  if (search) { sql += ' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)'; args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ' ORDER BY updated_at DESC';
  return db.prepare(sql).all(...args).map(hydrateProject);
}

function getProjectsByStatus() {
  const all = getProjects();
  const grouped = { concept: [], scoping: [], quoted: [], active: [], on_hold: [], closed_won: [], closed_lost: [] };
  for (const p of all) {
    if (grouped[p.status]) grouped[p.status].push(p);
  }
  return grouped;
}

function createProject(data, actorId) {
  const result = db.prepare(`
    INSERT INTO projects
      (name, description, problem, success_criteria, client_id, owner_id,
       status, priority, start_date, target_end_date, est_value_zar, est_hours,
       risk_level, risks, tags, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name || 'Untitled',
    data.description || null,
    data.problem || null,
    data.success_criteria || null,
    data.client_id || null,
    data.owner_id || actorId,
    data.status || 'concept',
    data.priority || 'normal',
    data.start_date || null,
    data.target_end_date || null,
    parseInt(data.est_value_zar) || 0,
    parseFloat(data.est_hours) || 0,
    data.risk_level || 'low',
    data.risks || null,
    JSON.stringify(parseTags(data.tags)),
    data.color || null
  );
  const projectId = result.lastInsertRowid;
  logActivity(projectId, actorId, 'created', 'Project created', { name: data.name });
  // Auto-add the owner as a project member
  db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, data.owner_id || actorId, 'owner');
  return projectId;
}

function updateProject(id, data, actorId) {
  const existing = getProject(id);
  if (!existing) return false;
  // Merge with existing for fields not provided in the request (so partial
  // updates from /status, /archive, etc. don't blank things out).
  const merged = {
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    problem: data.problem ?? existing.problem,
    success_criteria: data.success_criteria ?? existing.success_criteria,
    client_id: data.client_id !== undefined ? data.client_id : existing.client_id,
    owner_id: data.owner_id ?? existing.owner_id,
    status: data.status ?? existing.status,
    priority: data.priority ?? existing.priority,
    start_date: data.start_date !== undefined ? data.start_date : existing.start_date,
    target_end_date: data.target_end_date !== undefined ? data.target_end_date : existing.target_end_date,
    est_value_zar: data.est_value_zar ?? existing.est_value_zar,
    est_hours: data.est_hours ?? existing.est_hours,
    risk_level: data.risk_level ?? existing.risk_level,
    risks: data.risks ?? existing.risks,
    tags: data.tags !== undefined ? data.tags : existing.tags,
    color: data.color ?? existing.color,
  };
  db.prepare(`
    UPDATE projects SET
      name=?, description=?, problem=?, success_criteria=?, client_id=?, owner_id=?,
      status=?, priority=?, start_date=?, target_end_date=?, est_value_zar=?, est_hours=?,
      risk_level=?, risks=?, tags=?, color=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    merged.name, merged.description, merged.problem, merged.success_criteria,
    merged.client_id || null, merged.owner_id,
    merged.status, merged.priority, merged.start_date || null, merged.target_end_date || null,
    parseInt(merged.est_value_zar) || 0, parseFloat(merged.est_hours) || 0,
    merged.risk_level, merged.risks, JSON.stringify(parseTags(merged.tags)), merged.color, id
  );
  // Auto-log if status changed
  if (existing.status !== merged.status) {
    logActivity(id, actorId, 'status_changed', `Status: ${existing.status} → ${merged.status}`, { from: existing.status, to: merged.status });
    // Mirror to client activity timeline if linked
    if (merged.client_id) {
      try {
        const summary = `Project "${merged.name}" moved to ${merged.status}`;
        db.prepare('INSERT INTO interactions (client_id, type, summary, created_at) VALUES (?, ?, ?, ?)')
          .run(merged.client_id, 'project_status', summary, new Date().toISOString());
      } catch (_) {}
    }
  }
  return true;
}

function archiveProject(id, actorId) {
  db.prepare('UPDATE projects SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  logActivity(id, actorId, 'archived', 'Project archived');
}

function deleteProject(id) {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ---------- TASKS ----------

function getTask(id) {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!t) return null;
  return {
    ...t,
    sub_tasks: db.prepare('SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY sort_order, created_at').all(id),
    comments: db.prepare(`
      SELECT c.*, u.username, u.name
      FROM task_comments c LEFT JOIN users u ON c.author_id = u.id
      WHERE c.task_id = ? ORDER BY c.created_at DESC
    `).all(id),
  };
}

function getTasksForProject(projectId) {
  return db.prepare(`
    SELECT t.*, u.username AS assignee_username, u.name AS assignee_name
    FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.project_id = ? AND t.parent_task_id IS NULL
    ORDER BY
      CASE t.status WHEN 'doing' THEN 0 WHEN 'blocked' THEN 1 WHEN 'todo' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      t.due_date ASC NULLS LAST,
      t.sort_order ASC
  `).all(projectId);
}

function createTask(data, actorId) {
  const result = db.prepare(`
    INSERT INTO tasks
      (project_id, parent_task_id, title, description, assignee_id, status, priority, due_date, estimated_hours, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.project_id, data.parent_task_id || null, data.title, data.description || null,
    data.assignee_id || null, data.status || 'todo', data.priority || 'normal',
    data.due_date || null, parseFloat(data.estimated_hours) || 0, actorId
  );
  const taskId = result.lastInsertRowid;
  logActivity(data.project_id, actorId, 'task_added', `Task added: ${data.title}`);
  return taskId;
}

function updateTask(id, data, actorId) {
  const existing = getTask(id);
  if (!existing) return false;
  // Merge with existing so partial updates (e.g. /tasks/:tid/status with
  // just { status }) don't blank the other fields.
  const merged = {
    title: data.title ?? existing.title,
    description: data.description !== undefined ? data.description : existing.description,
    assignee_id: data.assignee_id !== undefined ? data.assignee_id : existing.assignee_id,
    status: data.status ?? existing.status,
    priority: data.priority ?? existing.priority,
    due_date: data.due_date !== undefined ? data.due_date : existing.due_date,
    estimated_hours: data.estimated_hours ?? existing.estimated_hours,
    blocked_reason: data.blocked_reason !== undefined ? data.blocked_reason : existing.blocked_reason,
  };
  db.prepare(`
    UPDATE tasks SET
      title=?, description=?, assignee_id=?, status=?, priority=?,
      due_date=?, estimated_hours=?, blocked_reason=?, updated_at=CURRENT_TIMESTAMP,
      completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id=?
  `).run(
    merged.title, merged.description || null, merged.assignee_id || null, merged.status, merged.priority,
    merged.due_date || null, parseFloat(merged.estimated_hours) || 0, merged.blocked_reason || null,
    merged.status, id
  );
  // Log if status changed
  if (existing.status !== merged.status) {
    logActivity(existing.project_id, actorId, 'task_status', `Task "${existing.title}": ${existing.status} → ${merged.status}`);
    if (merged.status === 'done') {
      logActivity(existing.project_id, actorId, 'task_done', `Task completed: ${existing.title}`);
    }
  }
  return true;
}

function deleteTask(id, actorId) {
  const existing = getTask(id);
  if (!existing) return false;
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  logActivity(existing.project_id, actorId, 'task_deleted', `Task deleted: ${existing.title}`);
  return true;
}

function addComment(taskId, authorId, body) {
  return db.prepare('INSERT INTO task_comments (task_id, author_id, body) VALUES (?, ?, ?)').run(taskId, authorId, body);
}

function getMyTasks(userId) {
  return db.prepare(`
    SELECT t.*, p.name AS project_name, p.status AS project_status, p.client_id,
           c.name AS client_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE t.assignee_id = ? AND t.status != 'done' AND t.status != 'cancelled'
      AND p.archived = 0
    ORDER BY
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END
  `).all(userId);
}

function getUpcomingTasks(userId, days = 7) {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return db.prepare(`
    SELECT t.*, p.name AS project_name, p.client_id, c.name AS client_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE t.assignee_id = ? AND t.status NOT IN ('done','cancelled')
      AND t.due_date IS NOT NULL AND t.due_date <= ?
      AND p.archived = 0
    ORDER BY t.due_date ASC
    LIMIT 10
  `).all(userId, future);
}

// ---------- PROJECT MEMBERS ----------

function getProjectMembers(projectId) {
  return db.prepare(`
    SELECT pm.*, u.username, u.name, u.role AS user_role
    FROM project_members pm JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
    ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END, u.name
  `).all(projectId);
}

function addProjectMember(projectId, userId, role = 'contributor') {
  return db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, userId, role);
}

function removeProjectMember(projectId, userId) {
  return db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, userId);
}

// ---------- ACTIVITY ----------

function logActivity(projectId, actorId, type, summary, meta = null) {
  return db.prepare('INSERT INTO project_activity (project_id, actor_id, type, summary, meta) VALUES (?, ?, ?, ?, ?)').run(
    projectId, actorId, type, summary, meta ? JSON.stringify(meta) : null
  );
}

function getProjectActivity(projectId, limit = 50) {
  return db.prepare(`
    SELECT a.*, u.username, u.name
    FROM project_activity a LEFT JOIN users u ON a.actor_id = u.id
    WHERE a.project_id = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(projectId, limit);
}

// ---------- STATS ----------

function getProjectStats(projectId) {
  const tasks = db.prepare('SELECT status, COUNT(*) as c FROM tasks WHERE project_id = ? AND parent_task_id IS NULL GROUP BY status').all(projectId);
  const total = tasks.reduce((s, t) => s + t.c, 0);
  const done = tasks.find(t => t.status === 'done')?.c || 0;
  return {
    total,
    done,
    doing: tasks.find(t => t.status === 'doing')?.c || 0,
    blocked: tasks.find(t => t.status === 'blocked')?.c || 0,
    todo: tasks.find(t => t.status === 'todo')?.c || 0,
    completion: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

function getProjectStatsGlobal() {
  const active = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'active'").get().c;
  const concepts = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'concept'").get().c;
  const scoping = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'scoping'").get().c;
  const quoted = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'quoted'").get().c;
  const onHold = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'on_hold'").get().c;
  const closedWon = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'closed_won'").get().c;
  const closedLost = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'closed_lost'").get().c;
  const totalValue = db.prepare("SELECT COALESCE(SUM(est_value_zar), 0) as v FROM projects WHERE status NOT IN ('closed_lost')").get().v;
  const overdueTasks = db.prepare(`
    SELECT COUNT(*) as c FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.due_date < DATE('now') AND t.status NOT IN ('done','cancelled') AND p.archived = 0
  `).get().c;
  return { active, concepts, scoping, quoted, onHold, closedWon, closedLost, totalValue, overdueTasks };
}

// ---------- HELPERS ----------

function safeJson(s, fb) { try { return JSON.parse(s || '[]'); } catch (_) { return fb; } }
function parseTags(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return input.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

module.exports = {
  // Constants
  PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
  PROJECT_PRIORITIES,
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  KANBAN_COLUMNS,
  // Projects
  getProject, getProjectWithDetails, getProjects, getProjectsByStatus,
  createProject, updateProject, archiveProject, deleteProject,
  // Tasks
  getTask, getTasksForProject, createTask, updateTask, deleteTask, addComment,
  getMyTasks, getUpcomingTasks,
  // Members
  getProjectMembers, addProjectMember, removeProjectMember,
  // Activity
  logActivity, getProjectActivity,
  // Stats
  getProjectStats, getProjectStatsGlobal,
  // Lifecycle
  ensureSchema,
};
