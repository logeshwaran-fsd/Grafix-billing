const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const multer = require('multer');
const { getDb } = require('../database/db');

const upload = multer({ dest: 'uploads/' });

router.get('/', (req, res) => {
  res.render('data/manage', { pageTitle: 'Data Management', activePage: 'data' });
});

router.get('/backup', (req, res) => {
  req.session.error = 'Backup is not supported in PostgreSQL mode directly via this route.';
  res.redirect('/data');
});

router.get('/export/products', async (req, res) => {
  try {
    const db = getDb();
    const productsRes = await db.query('SELECT p.code, p.name, c.name as category, p.unit_price, p.cost_price, p.stock_quantity, p.reorder_level, p.unit, p.gst_rate FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1');
    const products = productsRes.rows;
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(products);
    xlsx.utils.book_append_sheet(wb, ws, 'Products');
    
    const filePath = path.join(__dirname, '../uploads/products_export.xlsx');
    xlsx.writeFile(wb, filePath);
    res.download(filePath, 'products.xlsx', () => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
  } catch (err) {
    req.session.error = 'Export failed';
    res.redirect('/data');
  }
});

router.get('/export/customers', async (req, res) => {
  try {
    const db = getDb();
    const customersRes = await db.query('SELECT name, phone, email, address, gstin, city, state, pincode, balance FROM customers');
    const customers = customersRes.rows;
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(customers);
    xlsx.utils.book_append_sheet(wb, ws, 'Customers');
    
    const filePath = path.join(__dirname, '../uploads/customers_export.xlsx');
    xlsx.writeFile(wb, filePath);
    res.download(filePath, 'customers.xlsx', () => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
  } catch (err) {
    req.session.error = 'Export failed';
    res.redirect('/data');
  }
});

router.get('/export/database', (req, res) => {
  req.session.error = 'Database file download not supported for PostgreSQL.';
  res.redirect('/data');
});

router.post('/import/products', upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.session.error = 'Please select a file';
    return res.redirect('/data');
  }
  
  let client;
  try {
    const db = getDb();
    const workbook = xlsx.readFile(req.file.path);
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

    for (const row of sheetData) {
      if (!row.code || !row.name) continue;
      
      const branch_stocks = {};
      // Base stock quantity (if specified)
      let baseStock = parseInt(row.stock_quantity) || 0;
      let branchSum = 0;
      
      for (const branch of branches) {
         const key = Object.keys(row).find(k => k.toLowerCase().trim() === branch.toLowerCase() || (branch.toLowerCase() === 'parrys' && k.toLowerCase().trim() === 'paris'));
         const stock = key ? (parseInt(row[key]) || 0) : 0;
         branch_stocks[branch] = stock;
         branchSum += stock;
      }
      
      const totalStock = baseStock + branchSum;
      
      await client.query(query, [
        row.code.toString(),
        row.name,
        parseFloat(row.unit_price) || 0,
        parseFloat(row.cost_price) || 0,
        totalStock,
        branch_stocks,
        parseInt(row.reorder_level) || 10,
        row.unit || 'pcs',
        parseFloat(row.gst_rate) || 18
      ]);
    }
    
    await client.query('COMMIT');
    req.session.success = `Successfully imported ${sheetData.length} products!`;
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error(err);
    req.session.error = 'Failed to import products: ' + err.message;
  } finally {
    if (client) client.release();
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
  res.redirect('/data');
});

module.exports = router;
