const { getDb, initialize } = require('./database/db');

async function migrate() {
  initialize();
  const db = getDb();
  try {
    db.exec("ALTER TABLE invoices ADD COLUMN amount_paid REAL DEFAULT 0");
    console.log("Added amount_paid column.");
  } catch (err) {
    console.log("amount_paid column already exists.");
  }

  // Update existing invoices so old 'paid' bills have amount_paid = total_amount
  const info = db.prepare("UPDATE invoices SET amount_paid = total_amount WHERE payment_status = 'paid' AND amount_paid = 0").run();
  console.log(`Updated ${info.changes} old invoices.`);
}

migrate();
