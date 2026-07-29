const { getDb, initialize } = require('./database/db');
initialize().then(async () => {
  const db = getDb();
  try {
    const res = await db.query(`SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'products'`);
    console.log(res.rows);
  } catch(e) {
    console.error('ERROR:', e.message)
  }
  process.exit(0);
});
