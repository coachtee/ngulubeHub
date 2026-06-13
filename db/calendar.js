// db/calendar.js — Calendar events for the dashboard calendar view.
// Two event sources:
//   1. Tasks with due dates
//   2. Clients with cadence (last_contact_at + cadence_days) — derives "next due" events

const db = require('./schema');

/**
 * Get all calendar events for a given month.
 * Returns: [{ date: 'YYYY-MM-DD', kind: 'task'|'touch', id, title, meta, project_id, client_id }]
 */
function getEventsForMonth(year, month) {
  // month is 1-12
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const events = [];

  // 1. Tasks with due_date in this month
  const tasks = db.prepare(`
    SELECT t.id, t.title, t.priority, t.status, t.due_date, t.project_id, t.assignee_id,
           p.name AS project_name, p.client_id,
           c.name AS client_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE t.due_date IS NOT NULL
      AND t.due_date >= ? AND t.due_date <= ?
      AND t.status NOT IN ('done', 'cancelled')
      AND p.archived = 0
    ORDER BY t.due_date ASC
  `).all(startStr, endStr);
  for (const t of tasks) {
    events.push({
      date: t.due_date,
      kind: 'task',
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      project_id: t.project_id,
      project_name: t.project_name,
      client_id: t.client_id,
      client_name: t.client_name,
    });
  }

  // 2. Cadence-based touch events — for each client with cadence set, the next
  //    touch date that falls in this month
  const clients = db.prepare(`
    SELECT id, name, company, last_contact_at, cadence_days, intro_status
    FROM clients
    WHERE cadence_days IS NOT NULL AND cadence_days > 0
  `).all();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const c of clients) {
    if (!c.last_contact_at) {
      // Never contacted — suggest a touch on today's date or +7 days
      const suggested = new Date(today);
      if (c.intro_status === 'Not contacted') suggested.setDate(suggested.getDate() + 7);
      const ds = suggested.toISOString().slice(0, 10);
      if (ds >= startStr && ds <= endStr) {
        events.push({
          date: ds,
          kind: 'touch',
          id: c.id,
          title: `Intro ${c.name}` + (c.company ? ' (' + c.company + ')' : ''),
          client_id: c.id,
          is_overdue: false,
          is_first: true,
        });
      }
      continue;
    }
    // Calculate next touch: last_contact_at + cadence_days
    const last = new Date(c.last_contact_at);
    const next = new Date(last);
    next.setDate(next.getDate() + Number(c.cadence_days));
    const ds = next.toISOString().slice(0, 10);
    if (ds >= startStr && ds <= endStr) {
      const overdue = next < today;
      events.push({
        date: ds,
        kind: 'touch',
        id: c.id,
        title: `Touch ${c.name}` + (c.company ? ' (' + c.company + ')' : ''),
        client_id: c.id,
        is_overdue: overdue,
        is_first: false,
      });
    }
  }

  // Sort by date, then kind (tasks before touches), then title
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '');
  });

  return events;
}

function getEventsForRange(startStr, endStr) {
  // Same as getEventsForMonth but for arbitrary date range (used for week view etc)
  const events = [];
  const tasks = db.prepare(`
    SELECT t.id, t.title, t.priority, t.status, t.due_date, t.project_id, t.assignee_id,
           p.name AS project_name, p.client_id,
           c.name AS client_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE t.due_date IS NOT NULL
      AND t.due_date >= ? AND t.due_date <= ?
      AND t.status NOT IN ('done', 'cancelled')
      AND p.archived = 0
    ORDER BY t.due_date ASC
  `).all(startStr, endStr);
  for (const t of tasks) {
    events.push({
      date: t.due_date,
      kind: 'task',
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      project_id: t.project_id,
      project_name: t.project_name,
      client_id: t.client_id,
      client_name: t.client_name,
    });
  }
  return events;
}

function getUpcomingTouches(limit = 10) {
  // Returns the next N touches that are due or overdue
  const clients = db.prepare(`
    SELECT id, name, company, last_contact_at, cadence_days, intro_status
    FROM clients
    WHERE cadence_days IS NOT NULL AND cadence_days > 0
  `).all();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items = [];
  for (const c of clients) {
    let next;
    if (!c.last_contact_at) {
      next = new Date(today);
      if (c.intro_status === 'Not contacted') next.setDate(next.getDate() + 7);
    } else {
      next = new Date(c.last_contact_at);
      next.setDate(next.getDate() + Number(c.cadence_days));
    }
    const overdue = next < today;
    items.push({
      client_id: c.id,
      client_name: c.name,
      company: c.company,
      next_date: next.toISOString().slice(0, 10),
      days_until: Math.round((next - today) / 86400000),
      is_overdue: overdue,
    });
  }
  items.sort((a, b) => a.days_until - b.days_until);
  return items.slice(0, limit);
}

function getOverdueCount() {
  return getUpcomingTouches(999).filter(t => t.is_overdue).length;
}

function getTodayCount() {
  return getUpcomingTouches(999).filter(t => t.days_until === 0).length;
}

function getThisWeekCount() {
  return getUpcomingTouches(999).filter(t => t.days_until >= 0 && t.days_until <= 7).length;
}

module.exports = {
  getEventsForMonth,
  getEventsForRange,
  getUpcomingTouches,
  getOverdueCount,
  getTodayCount,
  getThisWeekCount,
};
