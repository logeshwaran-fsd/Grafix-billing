const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: 'C:\\Users\\acer\\Downloads\\inventory-billing-app\\.env' });

async function migrateData() {
  const sqliteDb = new sqlite3.Database('C:\\Users\\acer\\Downloads\\inventory-billing-app\\database\\inventory.db');
  
  const querySqlite = (sql) => new Promise((resolve, reject) => {
    sqliteDb.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await pgClient.connect();
    console.log('Connected to PG');
    
    // Order matters due to foreign keys
    const tables = [
      { name: 'users', order: 1 },
      { name: 'settings', order: 2 },
      { name: 'categories', order: 3 },
      { name: 'customers', order: 4 },
      { name: 'products', order: 5 },
      { name: 'invoices', order: 6 },
      { name: 'invoice_items', order: 7 },
      { name: 'stock_transactions', order: 8 },
      { name: 'tally_exports', order: 9 }
    ];

    for (const table of tables) {
      console.log(`Migrating table ${table.name}...`);
      
      const rows = await querySqlite(`SELECT * FROM ${table.name}`);
      if (!rows || rows.length === 0) {
        console.log(`No records in ${table.name}`);
        continue;
      }
      
      const columns = Object.keys(rows[0]);
      
      // Ignore truncate to prevent lock hangs
      // await pgClient.query(`TRUNCATE TABLE ${table.name} CASCADE`);
      
      let count = 0;
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async row => {
          const values = columns.map(c => row[c]);
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
          
          let conflictClause = '';
          if (columns.includes('id')) conflictClause = 'ON CONFLICT (id) DO NOTHING';
          else if (table.name === 'settings') conflictClause = 'ON CONFLICT (key) DO NOTHING';
          else conflictClause = 'ON CONFLICT DO NOTHING';

          await pgClient.query(`
            INSERT INTO ${table.name} (${columns.join(', ')})
            VALUES (${placeholders})
            ${conflictClause}
          `, values);
        }));
        count += chunk.length;
        console.log(`... ${count}/${rows.length} in ${table.name}`);
      }
      console.log(`Migrated ${count} records to ${table.name}`);
      
      // Reset sequence
      if (columns.includes('id')) {
        await pgClient.query(`
          SELECT setval(
            pg_get_serial_sequence('${table.name}', 'id'),
            (SELECT MAX(id) FROM ${table.name})
          )
        `);
      }
    }
    
    console.log('Data migration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    sqliteDb.close();
    await pgClient.end();
  }
}

migrateData();
