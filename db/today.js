// db/today.js — "Today" widget data for the dashboard.
// Aggregates the most important things the user should look at right now.

const db = require('./schema');
const projects = require('./projects');
const calendar = require('./calendar');

function getToday() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const inAWeek = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);

  // Overdue tasks
  const overdueTasks = db.prepare(`
    SELECT t.*, p.name AS project_name, p.client_id, c.name AS client_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE t.due_date < ? AND t.status NOT IN ('done','cancelled') AND p.archived = 0
    ORDER BY t.due_date ASC
    LIMIT 5
  `).all(todayStr);

  // Due today
  const dueToday = db.prepare(`
    SELECT t.*, p.name AS project_name, p.client_id, c.name AS client_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE t.due_date = ? AND t.status NOT IN ('done','cancelled') AND p.archived = 0
    ORDER BY t.priority DESC
    LIMIT 5
  `).all(todayStr);

  // Due this week
  const dueThisWeek = db.prepare(`
    SELECT t.*, p.name AS project_name, p.client_id, c.name AS client_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE t.due_date > ? AND t.due_date <= ? AND t.status NOT IN ('done','cancelled') AND p.archived = 0
    ORDER BY t.due_date ASC
    LIMIT 5
  `).all(todayStr, inAWeek);

  // Upcoming touches (top 5)
  const upcomingTouches = calendar.getUpcomingTouches(5);

  // Counts
  const counts = {
    overdueTasks: db.prepare(`
      SELECT COUNT(*) as c FROM tasks t JOIN projects p ON t.project_id = p.id
      WHERE t.due_date < ? AND t.status NOT IN ('done','cancelled') AND p.archived = 0
    `).get(todayStr).c,
    dueTodayTasks: dueToday.length,
    dueWeekTasks: db.prepare(`
      SELECT COUNT(*) as c FROM tasks t JOIN projects p ON t.project_id = p.id
      WHERE t.due_date >= ? AND t.due_date <= ? AND t.status NOT IN ('done','cancelled') AND p.archived = 0
    `).get(todayStr, inAWeek).c,
    overdueTouches: calendar.getOverdueCount(),
    todayTouches: calendar.getTodayCount(),
    weekTouches: calendar.getThisWeekCount(),
    activeProjects: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status IN ('active','scoping','quoted') AND archived = 0").get().c,
  };

  return {
    today: todayStr,
    overdueTasks, dueToday, dueThisWeek, upcomingTouches, counts,
  };
}

module.exports = { getToday };
