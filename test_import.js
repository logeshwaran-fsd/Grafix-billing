const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { getDb, initialize } = require('./database/db');

initialize().then(async () => {
  const db = getDb();
  let client;
  try {
    const workbook = xlsx.readFile('test.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    client = await db.connect();
    await client.query('BEGIN');
    
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
    `;
    
    const branchesRes = await client.query('SELECT name FROM branches');
    const branches = branchesRes.rows.map(b => b.name);

    let processedCount = 0;
    let promises = [];
    
    for (const rawRow of sheetData) {
      const row = {};
      for (const k in rawRow) {
        row[k.toLowerCase().trim()] = rawRow[k];
      }
      
      let code = row['code'] || row['item code'] || row['product code'];
      let name = row['name'] || row['item name'] || row['product name'] || row['product'];
      
      if (code !== undefined) code = code.toString().trim();
      if (name !== undefined) name = name.toString().trim();

      if (!code || !name) continue;
      
      const branch_stocks = {};
      let baseStock = parseInt(row.stock_quantity) || parseInt(row.total_stock) || 0;
      let branchSum = 0;
      let hasBranchColumns = false;
      
      for (const branch of branches) {
         const branchKey = branch.toLowerCase();
         const key = Object.keys(row).find(k => k === branchKey || (branchKey === 'parrys' && k === 'paris'));
         if (key !== undefined) hasBranchColumns = true;
         const stock = key ? (parseInt(row[key]) || 0) : 0;
         branch_stocks[branch] = stock;
         branchSum += stock;
      }
      
      const totalStock = hasBranchColumns ? branchSum : baseStock;
      
      promises.push(client.query(query, [
        code,
        name,
        parseFloat(row.unit_price) || 0,
        parseFloat(row.cost_price) || 0,
        totalStock,
        branch_stocks,
        parseInt(row.reorder_level) || 10,
        row.unit || 'pcs',
        parseFloat(row.gst_rate) || 18
      ]));
      processedCount++;
      
      if (promises.length >= 100) {
        await Promise.all(promises);
        promises = [];
      }
    }
    
    if (promises.length > 0) {
      await Promise.all(promises);
    }
    
    await client.query('COMMIT');
    console.log(`Successfully processed ${processedCount} valid products out of ${sheetData.length} rows!`);
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('ERROR:', err);
  } finally {
    if (client) client.release();
  }
  process.exit(0);
});
