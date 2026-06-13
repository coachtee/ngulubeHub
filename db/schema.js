// db/schema.js — initializes SQLite schema
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'ngulubehub.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'admin',     -- 'superadmin' (can manage other admins) | 'admin'
  last_login_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  website TEXT,
  sector TEXT,                  -- high-level: "Finance", "Healthcare", "IT Services"
  industry TEXT,                -- mid-level: "Financial Advisory", "Banking", "Radiology"
  sub_industry TEXT,            -- specific: "Personal Financial Planning", "Cathlab Imaging"
  region TEXT DEFAULT 'South Africa',
  bio TEXT,
  focus_areas TEXT,             -- JSON array
  pain_points TEXT,             -- JSON array
  ai_solutions TEXT,            -- JSON array of {name, category, why_match, est_value}
  tags TEXT,                    -- JSON array
  contact_email TEXT,
  contact_phone TEXT,
  intro_status TEXT DEFAULT 'Not contacted',
  source TEXT,                  -- where they came from (group, referral, etc.)
  notes TEXT,
  last_contact_at TEXT,         -- date of most recent outreach touch
  cadence_days INTEGER,         -- e.g. 14 = touch every 2 weeks; null = no cadence
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  type TEXT,                    -- call, email, meeting, intro_sent
  summary TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_solutions_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT,
  description TEXT,
  industries TEXT,              -- JSON array of industry strings
  est_value TEXT                -- indicative ZAR pricing string
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  filename TEXT NOT NULL,         -- sanitized stored name
  original_name TEXT NOT NULL,    -- user-supplied filename
  mime_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT NOT NULL,     -- absolute path on disk
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clients_sector ON clients(sector);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(intro_status);
CREATE INDEX IF NOT EXISTS idx_interactions_client ON interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_attachments_client ON attachments(client_id);
`);

module.exports = db;
