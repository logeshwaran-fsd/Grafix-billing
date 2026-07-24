const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', (req, res) => {
  const search = req.query.search || '';
  try {
    const db = getDb();
    let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1';
    const params = [];
    if (search) {
      query += ' AND (p.name LIKE ? OR p.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY p.code ASC';
    const products = db.prepare(query).all(...params);

    const stats = db.prepare(`
      SELECT 
        COUNT(id) as total,
        SUM(CASE WHEN stock_quantity > reorder_level THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN stock_quantity <= reorder_level AND stock_quantity > 0 THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out
      FROM products WHERE is_active = 1
    `).get();

    res.render('inventory/stock', { pageTitle: 'Stock Overview', activePage: 'inventory', products, stats, search });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to load stock data', activePage: 'inventory' });
  }
});

router.get('/adjust/:id', (req, res) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.redirect('/inventory');
    const transactions = db.prepare(`
      SELECT t.*, u.full_name as user_name 
      FROM stock_transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.product_id = ?
      ORDER BY t.created_at DESC
      LIMIT 10
    `).all(req.params.id);
    res.render('inventory/adjust', { pageTitle: 'Stock Adjustment', activePage: 'inventory', product, transactions });
  } catch (err) {
    res.redirect('/inventory');
  }
});

router.post('/adjust/:id', (req, res) => {
  const { type, quantity, notes } = req.body;
  const qty = parseInt(quantity);
  if (!qty || qty <= 0) {
    req.session.error = 'Invalid quantity!';
    return res.redirect(`/inventory/adjust/${req.params.id}`);
  }
  
  const db = getDb();
  const tx = db.transaction(() => {
    const change = type === 'purchase' || type === 'return' ? qty : -qty;
    db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?').run(change, req.params.id);
    db.prepare(`
      INSERT INTO stock_transactions (product_id, type, quantity, notes, user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, type, change, notes, req.session.user.id);
  });

  try {
    tx();
    req.session.success = 'Stock adjusted successfully!';
  } catch (err) {
    req.session.error = 'Failed to adjust stock: ' + err.message;
  }
  res.redirect(`/inventory/adjust/${req.params.id}`);
});

router.post('/api/adjust/:id', (req, res) => {
  const { type, quantity, notes } = req.body;
  const qty = parseInt(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid quantity!' });
  }
  
  const db = getDb();
  try {
    const tx = db.transaction(() => {
      const change = type === 'purchase' || type === 'return' ? qty : -qty;
      db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?').run(change, req.params.id);
      db.prepare(`
        INSERT INTO stock_transactions (product_id, type, quantity, notes, user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.params.id, type, change, notes || 'Quick adjustment', req.session.user.id);
      
      const newStock = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(req.params.id).stock_quantity;
      return newStock;
    });

    const newStock = tx();
    res.json({ success: true, newStock });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/transactions', (req, res) => {
  try {
    const db = getDb();
    const transactions = db.prepare(`
      SELECT t.*, p.name as product_name, p.code as product_code, u.full_name as user_name
      FROM stock_transactions t
      JOIN products p ON t.product_id = p.id
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `).all();
    res.render('inventory/transactions', { pageTitle: 'Stock Transactions', activePage: 'inventory', transactions });
  } catch (err) {
    res.redirect('/inventory');
  }
});

module.exports = router;
