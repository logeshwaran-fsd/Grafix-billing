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

router.get('/export/products', (req, res) => {
  try {
    const db = getDb();
    const products = db.prepare('SELECT p.code, p.name, c.name as category, p.unit_price, p.cost_price, p.stock_quantity, p.reorder_level, p.unit, p.gst_rate FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1').all();
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(products);
    xlsx.utils.book_append_sheet(wb, ws, 'Products');
    
    const filePath = path.join(__dirname, '../uploads/products_export.xlsx');
    xlsx.writeFile(wb, filePath);
    res.download(filePath, 'products.xlsx', () => {
      fs.unlinkSync(filePath);
    });
  } catch (err) {
    req.session.error = 'Export failed';
    res.redirect('/data');
  }
});

router.get('/export/customers', (req, res) => {
  try {
    const db = getDb();
    const customers = db.prepare('SELECT name, phone, email, address, gstin, city, state, pincode, balance FROM customers').all();
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(customers);
    xlsx.utils.book_append_sheet(wb, ws, 'Customers');
    
    const filePath = path.join(__dirname, '../uploads/customers_export.xlsx');
    xlsx.writeFile(wb, filePath);
    res.download(filePath, 'customers.xlsx', () => {
      fs.unlinkSync(filePath);
    });
  } catch (err) {
    req.session.error = 'Export failed';
    res.redirect('/data');
  }
});

router.get('/export/database', (req, res) => {
  const dbPath = path.join(__dirname, '../database/inventory.db');
  if (fs.existsSync(dbPath)) {
    res.download(dbPath, 'inventory.db');
  } else {
    req.session.error = 'Database file not found!';
    res.redirect('/data');
  }
});

router.post('/import/products', upload.single('file'), (req, res) => {
  if (!req.file) {
    req.session.error = 'Please select a file';
    return res.redirect('/data');
  }
  
  try {
    const db = getDb();
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO products (code, name, unit_price, cost_price, stock_quantity, reorder_level, unit, gst_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const tx = db.transaction((rows) => {
      for (const row of rows) {
        if (!row.code || !row.name) continue;
        stmt.run(
          row.code.toString(),
          row.name,
          parseFloat(row.unit_price) || 0,
          parseFloat(row.cost_price) || 0,
          parseInt(row.stock_quantity) || 0,
          parseInt(row.reorder_level) || 10,
          row.unit || 'pcs',
          parseFloat(row.gst_rate) || 18
        );
      }
    });
    
    tx(sheetData);
    req.session.success = `Successfully imported ${sheetData.length} products!`;
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to import products: ' + err.message;
  } finally {
    fs.unlinkSync(req.file.path);
  }
  res.redirect('/data');
});

module.exports = router;
