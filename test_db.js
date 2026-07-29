const { getDb, initialize } = require('./database/db');
initialize().then(async () => {
  const db = getDb();
  try {
    const query = `
      INSERT INTO products (code, name, unit_price, cost_price, stock_quantity, branch_stocks, reorder_level, unit, gst_rate, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        unit_price = EXCLUDED.unit_price,
        cost_price = EXCLUDED.cost_price,
        stock_quantity = EXCLUDED.stock_quantity,
        branch_stocks = EXCLUDED.branch_stocks,
        reorder_level = EXCLUDED.reorder_level,
        unit = EXCLUDED.unit,
        gst_rate = EXCLUDED.gst_rate,
        is_active = 1
      RETURNING id
    `;
    const res = await db.query(query, ['159', 'COLOP DATER S226/P NUMBER TEST', 400, 0, 10, {Parrys: 10}, 10, 'pcs', 18]);
    console.log("Success:", res.rows);
  } catch(e) {
    console.error('ERROR:', e.message)
  }
  process.exit(0);
});
