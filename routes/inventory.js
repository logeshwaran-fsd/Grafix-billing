const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  try {
    const db = getDb();
    const branchesRes = await db.query('SELECT name FROM branches ORDER BY name ASC');
    const branches = branchesRes.rows.map(b => b.name);

    let whereClause = 'WHERE p.is_active = 1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (p.name ILIKE $${paramIndex++} OR p.code ILIKE $${paramIndex++})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const countRes = await db.query(`SELECT COUNT(*) as count FROM products p ${whereClause}`, params);
    const totalCount = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const limitIdx = paramIndex++;
    const offsetIdx = paramIndex++;
    params.push(limit, offset);

    const query = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      ${whereClause} 
      ORDER BY CASE WHEN p.code ~ '^[0-9]+$' THEN LPAD(p.code, 10, '0') ELSE p.code END ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const productsRes = await db.query(query, params);
    const products = productsRes.rows;

    const statsRes = await db.query(`
      SELECT 
        COUNT(id) as total,
        COALESCE(SUM(CASE WHEN COALESCE(stock_quantity, 0) > COALESCE(reorder_level, 10) THEN 1 ELSE 0 END), 0) as ok,
        COALESCE(SUM(CASE WHEN COALESCE(stock_quantity, 0) <= COALESCE(reorder_level, 10) AND COALESCE(stock_quantity, 0) > 0 THEN 1 ELSE 0 END), 0) as low,
        COALESCE(SUM(CASE WHEN COALESCE(stock_quantity, 0) = 0 THEN 1 ELSE 0 END), 0) as out
      FROM products WHERE is_active = 1
    `);
    const stats = statsRes.rows[0] || { total: 0, ok: 0, low: 0, out: 0 };
    const categoriesRes = await db.query('SELECT * FROM categories ORDER BY name ASC');
    const categories = categoriesRes.rows;

    res.render('inventory/stock', { 
      pageTitle: 'Stock Overview', 
      activePage: 'inventory', 
      products, 
      stats, 
      search, 
      branches, 
      categories,
      pagination: { page, totalPages, totalCount }
    });
  } catch (err) {
    console.error('Error loading inventory stock page:', err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to load stock data: ' + err.message, activePage: 'inventory' });
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
  const { type, quantity, notes, branch } = req.body;
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
    if (branch) {
      await client.query(`
        UPDATE products 
        SET stock_quantity = COALESCE(stock_quantity, 0) + $1::numeric,
            branch_stocks = jsonb_set(
              COALESCE(branch_stocks, '{}'::jsonb), 
              ARRAY[$2::text], 
              to_jsonb(COALESCE((COALESCE(branch_stocks, '{}'::jsonb)->>$2::text)::numeric, 0) + $1::numeric),
              true
            )
        WHERE id = $3::integer
      `, [change, branch, req.params.id]);
    } else {
      await client.query('UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + $1::numeric WHERE id = $2::integer', [change, req.params.id]);
    }

    const noteText = notes ? `${notes} ${branch ? '(' + branch + ')' : ''}` : `Stock adjustment ${branch ? '(' + branch + ')' : ''}`;
    await client.query(`
      INSERT INTO stock_transactions (product_id, type, quantity, notes, user_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [req.params.id, type, change, noteText, req.session.user ? req.session.user.id : null]);
    
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
        SET stock_quantity = COALESCE(stock_quantity, 0) + $1::numeric,
            branch_stocks = jsonb_set(
              COALESCE(branch_stocks, '{}'::jsonb), 
              ARRAY[$2::text], 
              to_jsonb(COALESCE((COALESCE(branch_stocks, '{}'::jsonb)->>$2::text)::numeric, 0) + $1::numeric),
              true
            )
        WHERE id = $3::integer
      `, [change, branch, req.params.id]);
    } else {
      await client.query('UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + $1::numeric WHERE id = $2::integer', [change, req.params.id]);
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
    res.json({ success: true, newStock, newStockTotal, newBranchStocks, branch });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

router.get('/transactions', async (req, res) => {
  const search = req.query.search || '';
  const type = req.query.type || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const db = getDb();
    let whereClauses = [];
    let params = [];
    let pIdx = 1;

    if (search) {
      whereClauses.push(`(p.name ILIKE $${pIdx} OR p.code ILIKE $${pIdx} OR t.notes ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    if (type) {
      whereClauses.push(`t.type = $${pIdx}`);
      params.push(type);
      pIdx++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await db.query(`
      SELECT COUNT(*) as count 
      FROM stock_transactions t
      JOIN products p ON t.product_id = p.id
      ${whereSql}
    `, params);
    const totalCount = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const limitIdx = pIdx++;
    const offsetIdx = pIdx++;
    params.push(limit, offset);

    const transactionsRes = await db.query(`
      SELECT t.*, p.name as product_name, p.code as product_code, u.full_name as user_name
      FROM stock_transactions t
      JOIN products p ON t.product_id = p.id
      LEFT JOIN users u ON t.user_id = u.id
      ${whereSql}
      ORDER BY t.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params);

    const countsRes = await db.query(`
      SELECT 
        COUNT(*) as all_count,
        COUNT(CASE WHEN type = 'adjustment' THEN 1 END) as adjustment_count,
        COUNT(CASE WHEN type = 'purchase' THEN 1 END) as purchase_count,
        COUNT(CASE WHEN type = 'sale' THEN 1 END) as sale_count,
        COUNT(CASE WHEN type = 'return' THEN 1 END) as return_count
      FROM stock_transactions
    `);
    const typeCounts = countsRes.rows[0];

    const transactions = transactionsRes.rows;
    res.render('inventory/transactions', { 
      pageTitle: 'Stock Transaction History', 
      activePage: 'inventory', 
      transactions,
      search,
      selectedType: type,
      typeCounts,
      pagination: { page, totalPages, totalCount }
    });
  } catch (err) {
    console.error(err);
    res.redirect('/inventory');
  }
});

module.exports = router;
