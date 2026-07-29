const { getDb, initialize } = require('./database/db');
initialize().then(async () => {
  const db = getDb();
  try {
    const q = `
        UPDATE products 
        SET stock_quantity = stock_quantity + $1,
            branch_stocks = jsonb_set(branch_stocks, ARRAY[$2], (COALESCE((branch_stocks->>$2)::numeric, 0) + $1)::text::jsonb)
        WHERE id = $3
    `;
    await db.query(q, [5, 'Parrys', '1667']);
    console.log('success');
  } catch(e) {
    console.error('ERROR:', e.message)
  }
  process.exit(0);
});
