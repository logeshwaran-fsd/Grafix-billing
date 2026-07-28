const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res) => {
  const search = req.query.search || '';
  try {
    const db = getDb();
    let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex++} OR p.code ILIKE $${paramIndex++})`;
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY p.code ASC';
    const productsRes = await db.query(query, params);
    const products = productsRes.rows;

    const statsRes = await db.query(`
      SELECT 
        COUNT(id) as total,
        SUM(CASE WHEN stock_quantity > reorder_level THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN stock_quantity <= reorder_level AND stock_quantity > 0 THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out
      FROM products WHERE is_active = 1
    `);
    const stats = statsRes.rows[0];

    res.render('inventory/stock', { pageTitle: 'Stock Overview', activePage: 'inventory', products, stats, search });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to load stock data', activePage: 'inventory' });
  }
});

router.get('/adjust/:id', async (req, res) => {
  try {
    const db = getDb();
    const productRes = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const product = productRes.rows[0];
    if (!product) return res.redirect('/inventory');
    
    const transactionsRes = await db.query(`
      SELECT t.*, u.full_name as user_name 
      FROM stock_transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.product_id = $1
      ORDER BY t.created_at DESC
      LIMIT 10
    `, [req.params.id]);
    const transactions = transactionsRes.rows;

    res.render('inventory/adjust', { pageTitle: 'Stock Adjustment', activePage: 'inventory', product, transactions });
  } catch (err) {
    res.redirect('/inventory');
  }
});

router.post('/adjust/:id', async (req, res) => {
  const { type, quantity, notes } = req.body;
  const qty = parseInt(quantity);
  if (!qty || qty <= 0) {
    req.session.error = 'Invalid quantity!';
    return res.redirect(`/inventory/adjust/${req.params.id}`);
  }
  
  const db = getDb();
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    
    const change = type === 'purchase' || type === 'return' ? qty : -qty;
    await client.query('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2', [change, req.params.id]);
    await client.query(`
      INSERT INTO stock_transactions (product_id, type, quantity, notes, user_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [req.params.id, type, change, notes, req.session.user.id]);
    
    await client.query('COMMIT');
    req.session.success = 'Stock adjusted successfully!';
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    req.session.error = 'Failed to adjust stock: ' + err.message;
  } finally {
    if (client) client.release();
  }
  res.redirect(`/inventory/adjust/${req.params.id}`);
});

router.post('/api/adjust/:id', async (req, res) => {
  const { type, quantity, notes, branch } = req.body;
  const qty = parseInt(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid quantity!' });
  }
  
  const db = getDb();
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    
    const change = type === 'purchase' || type === 'return' ? qty : -qty;
    
    if (branch) {
      await client.query(`
        UPDATE products 
        SET stock_quantity = stock_quantity + $1,
            branch_stocks = jsonb_set(branch_stocks, ARRAY[$2], (COALESCE((branch_stocks->>$2)::numeric, 0) + $1)::text::jsonb)
        WHERE id = $3
      `, [change, branch, req.params.id]);
    } else {
      await client.query('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2', [change, req.params.id]);
    }
    await client.query(`
      INSERT INTO stock_transactions (product_id, type, quantity, notes, user_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [req.params.id, type, change, notes || 'Quick adjustment', req.session.user.id]);
    
    const newStockRes = await client.query('SELECT stock_quantity, branch_stocks FROM products WHERE id = $1', [req.params.id]);
    const newStockTotal = newStockRes.rows[0].stock_quantity;
    const newBranchStocks = newStockRes.rows[0].branch_stocks;
    
    // For UI update, if a branch was specified, we can return the updated branch stock
    const newStock = branch && newBranchStocks && newBranchStocks[branch] !== undefined ? newBranchStocks[branch] : newStockTotal;
    
    await client.query('COMMIT');
    res.json({ success: true, newStock });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const db = getDb();
    const transactionsRes = await db.query(`
      SELECT t.*, p.name as product_name, p.code as product_code, u.full_name as user_name
      FROM stock_transactions t
      JOIN products p ON t.product_id = p.id
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    const transactions = transactionsRes.rows;
    res.render('inventory/transactions', { pageTitle: 'Stock Transactions', activePage: 'inventory', transactions });
  } catch (err) {
    res.redirect('/inventory');
  }
});

module.exports = router;
