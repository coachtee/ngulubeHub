// db/users.js — auth helpers for the users table
const bcrypt = require('bcryptjs');
const db = require('./schema');

const SALT_ROUNDS = 10;

function getById(id) {
  return db.prepare('SELECT id, username, name, role, last_login_at, created_at FROM users WHERE id = ?').get(id);
}
function getByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}
function listAll() {
  return db.prepare('SELECT id, username, name, role, last_login_at, created_at FROM users ORDER BY created_at ASC').all();
}
function countAll() {
  return db.prepare('SELECT COUNT(*) as c FROM users').get().c;
}

function create({ username, password, name, role = 'admin' }) {
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)'
  ).run(username, hash, name || username, role);
  return getById(result.lastInsertRowid);
}

function verifyPassword(username, password) {
  const user = getByUsername(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  // update last login — wrap in try so a transient write error
  // (e.g. readonly volume) doesn't prevent the user from signing in.
  try {
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  } catch (err) {
    // Log but don't fail login
    console.warn('[users.verifyPassword] could not update last_login_at:', err.message);
  }
  return getById(user.id);
}

function remove(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function update(id, { name, role, username }) {
  // Update name, role, username (password is changed separately via changePassword)
  const cur = getById(id);
  if (!cur) return null;
  const newName = (typeof name === 'string' && name.trim()) ? name.trim() : cur.name;
  const newRole = (role === 'superadmin' || role === 'admin') ? role : cur.role;
  const newUsername = (typeof username === 'string' && username.trim()) ? username.trim().toLowerCase() : cur.username;
  db.prepare('UPDATE users SET name = ?, role = ?, username = ? WHERE id = ?').run(newName, newRole, newUsername, id);
  return getById(id);
}

function changePassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  return db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}

module.exports = {
  getById, getByUsername, listAll, countAll, create, verifyPassword, remove, update, changePassword,
};
