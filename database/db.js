const { Pool, types } = require('pg');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Parse PostgreSQL NUMERIC/DECIMAL (OID 1700) as float instead of string
types.setTypeParser(1700, function(val) {
  return parseFloat(val);
});

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  require('dotenv').config();
}

let pool;

function getDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Provide a helper to run standard async queries
    pool.queryAsync = async function(text, params) {
      return this.query(text, params);
    };

    // Provide a helper for transactions
    pool.transaction = async function(fn) {
      const client = await this.connect();
      try {
        await client.query('BEGIN');
        const res = await fn(client);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    };
  }
  return pool;
}

async function initialize() {
  const database = getDb();
  
  // Note: For PostgreSQL, we will run the schema script.
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await database.query(schema);

    const userRes = await database.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(userRes.rows[0].count, 10) === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await database.query(
        'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4)',
        ['admin', hash, 'admin', 'Administrator']
      );
      
      const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
      await database.query(seed);
    }
    
    // Migration: Add invoice_type if not exists
    try {
      await database.query("ALTER TABLE invoices ADD COLUMN invoice_type VARCHAR(50) DEFAULT 'gst'");
    } catch (err) {}

    // Migration: Add opening_balance
    try {
      await database.query("ALTER TABLE customers ADD COLUMN opening_balance DECIMAL(10,2) DEFAULT 0.0");
    } catch (err) {}

    // Migration: Add amount_paid
    try {
      await database.query("ALTER TABLE invoices ADD COLUMN amount_paid DECIMAL(10,2) DEFAULT 0.0");
    } catch (err) {}

    // Migration: Add phone_01 and phone_02 columns to customers
    try {
      await database.query("ALTER TABLE customers ADD COLUMN phone_01 TEXT");
    } catch (err) {}
    try {
      await database.query("ALTER TABLE customers ADD COLUMN phone_02 TEXT");
    } catch (err) {}

    // Migration: Ensure only numbered branches exist (01-Parrys, 02-Ambattur) and purge unnumbered ones
    try {
      await database.query("INSERT INTO branches (name) VALUES ('01-Parrys'), ('02-Ambattur') ON CONFLICT (name) DO NOTHING");
      await database.query("UPDATE invoices SET branch = '01-Parrys' WHERE branch = 'Parrys' OR branch = 'parris'");
      await database.query("UPDATE invoices SET branch = '02-Ambattur' WHERE branch = 'Ambattur' OR branch = 'ambatur'");
      await database.query("DELETE FROM branches WHERE name IN ('Parrys', 'Ambattur', 'parris', 'ambatur')");
      await database.query("UPDATE products SET branch_stocks = (branch_stocks - 'Parrys' - 'Ambattur' - 'parris' - 'ambatur') WHERE branch_stocks IS NOT NULL");
    } catch (err) {}

  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// These must be async now
async function getSetting(key) {
  const res = await getDb().query('SELECT value FROM settings WHERE key = $1', [key]);
  return res.rows.length ? res.rows[0].value : null;
}

async function getAllSettings() {
  const res = await getDb().query('SELECT key, value FROM settings');
  const settings = {};
  res.rows.forEach(row => { settings[row.key] = row.value; });
  return settings;
}

async function updateSetting(key, value) {
  await getDb().query(`
    INSERT INTO settings (key, value) 
    VALUES ($1, $2) 
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [key, value]);
}

module.exports = { getDb, initialize, getSetting, getAllSettings, updateSetting };
