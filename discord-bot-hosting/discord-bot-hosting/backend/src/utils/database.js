/**
 * SQLite Database Manager
 * Secure storage for users, bots, configs and logs
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../data/platform.db');

let db = null;

function initDatabase() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    )
  `);

  // Bots
  db.exec(`
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('webhook', 'facs', 'tickets', 'discord')),
      token_encrypted TEXT NOT NULL,
      status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'offline', 'restarting', 'error')),
      guild_id TEXT,
      guild_name TEXT,
      config TEXT DEFAULT '{}',
      uptime_start TEXT,
      last_restart TEXT,
      last_error TEXT,
      restart_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Bot logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT NOT NULL,
      level TEXT DEFAULT 'info',
      message TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
    )
  `);

  // Platform logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bots_type ON bots(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bot_logs_bot ON bot_logs(bot_id)`);

  logger.info('Database initialized successfully');
  return db;
}

function getDb() {
  if (!db) {
    initDatabase();
  }
  return db;
}

module.exports = { initDatabase, getDb };
