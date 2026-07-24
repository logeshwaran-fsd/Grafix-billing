const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'inventory.db');
let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA foreign_keys = ON');
    
    db.transaction = function(fn) {
      return (...args) => {
        db.exec('BEGIN TRANSACTION');
        try {
          const res = fn(...args);
          db.exec('COMMIT');
          return res;
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      };
    };
  }
  return db;
}

function initialize() {
  const database = getDb();
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  database.exec(schema);
  
  const userCount = database.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    database.prepare('INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)').run('admin', hash, 'admin', 'Administrator');
  }
  
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  database.exec(seed);
  
  // Migration: Add invoice_type column to invoices table if not exists
  try {
    database.exec("ALTER TABLE invoices ADD COLUMN invoice_type TEXT DEFAULT 'gst'");
  } catch (err) {
    // Column already exists
  }

  // Migration: Add opening_balance column to customers table if not exists
  try {
    database.exec("ALTER TABLE customers ADD COLUMN opening_balance REAL DEFAULT 0.0");
  } catch (err) {
    // Column already exists
  }

  // Create payments table
  database.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      narration TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);
  
  console.log('Database initialized successfully');
}

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(row => { settings[row.key] = row.value; });
  return settings;
}

function updateSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

module.exports = { getDb, initialize, getSetting, getAllSettings, updateSetting };
