const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const db = getDb();
    let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (p.name ILIKE $${paramIndex++} OR p.code ILIKE $${paramIndex++})`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      query += ` AND p.category_id = $${paramIndex++}`;
      params.push(category);
    }

    const totalCountQuery = query.replace('p.*, c.name as category_name', 'COUNT(p.id) as count');
    const countRes = await db.query(totalCountQuery, params);
    const totalCount = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    query += ` ORDER BY p.code ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const productsRes = await db.query(query, params);
    const products = productsRes.rows;

    const categoriesRes = await db.query('SELECT * FROM categories');
    const categories = categoriesRes.rows;

    const branchesRes = await db.query('SELECT name FROM branches ORDER BY name ASC');
    const branches = branchesRes.rows;

    res.render('products/list', {
      pageTitle: 'Products',
      activePage: 'products',
      products,
      categories,
      branches,
      search,
      selectedCategory: category,
      pagination: { page, totalPages }
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch products', activePage: 'products' });
  }
});

router.get('/api/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    const db = getDb();
    const resDb = await db.query(`
      SELECT id, code, name, unit_price, stock_quantity, branch_stocks, gst_rate 
      FROM products 
      WHERE (name ILIKE $1 OR code ILIKE $2) AND is_active = 1
      LIMIT 10
    `, [`${q}%`, `${q}%`]);
    res.json(resDb.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/history/:id', async (req, res) => {
  try {
    const db = getDb();
    // Get the last 10 purchases of this product, showing customer and date
    const resDb = await db.query(`
      SELECT c.name as customer_name, i.date as invoice_date, ii.quantity, ii.unit_price
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE ii.product_id = $1
      ORDER BY i.date DESC
      LIMIT 10
    `, [req.params.id]);
    res.json(resDb.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/add', async (req, res) => {
  try {
    const categoriesRes = await getDb().query('SELECT * FROM categories');
    const branchesRes = await getDb().query('SELECT * FROM branches ORDER BY name ASC');
    res.render('products/form', { pageTitle: 'Add Product', activePage: 'products', product: null, categories: categoriesRes.rows, branches: branchesRes.rows });
  } catch (err) {
    res.redirect('/products');
  }
});

router.post('/add', async (req, res) => {
  const { code, name, category_id, unit_price, cost_price, reorder_level, unit, hsn_code, gst_rate, description } = req.body;
  try {
    const db = getDb();
    const branchesRes = await db.query('SELECT name FROM branches');
    const branch_stocks = {};
    let total_stock = 0;
    for (const b of branchesRes.rows) {
      const stock = parseInt(req.body[`branch_${b.name}`]) || 0;
      branch_stocks[b.name] = stock;
      total_stock += stock;
    }

    await db.query(`
      INSERT INTO products (code, name, category_id, unit_price, cost_price, stock_quantity, branch_stocks, reorder_level, unit, hsn_code, gst_rate, description) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [code, name, category_id || null, unit_price, cost_price, total_stock, branch_stocks, reorder_level, unit, hsn_code, gst_rate, description]);
    req.session.success = 'Product added successfully!';
    res.redirect('/products');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to add product: Code must be unique';
    res.redirect('/products/add');
  }
});

router.post('/api/quick-add', async (req, res) => {
  const { code, name, unit_price, cost_price, stock_quantity, gst_rate } = req.body;
  if (!code || !name) return res.status(400).json({ success: false, error: 'Code and Name are required' });
  try {
    const db = getDb();
    const result = await db.query(`
      INSERT INTO products (code, name, unit_price, cost_price, stock_quantity, reorder_level, unit, gst_rate, is_active) 
      VALUES ($1, $2, $3, $4, $5, 10, 'pcs', $6, 1) RETURNING *
    `, [code, name, unit_price || 0, cost_price || 0, stock_quantity || 0, gst_rate || 18]);
    const insertedProduct = result.rows[0];
    res.json({ success: true, product: { id: insertedProduct.id, code, name, unit_price: unit_price || 0, stock_quantity: stock_quantity || 0, gst_rate: gst_rate || 18 } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add product (code might not be unique)' });
  }
});

router.get('/edit/:id', async (req, res) => {
  try {
    const db = getDb();
    const productRes = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const categoriesRes = await db.query('SELECT * FROM categories');
    const branchesRes = await db.query('SELECT * FROM branches ORDER BY name ASC');
    if (productRes.rows.length === 0) return res.redirect('/products');
    res.render('products/form', { pageTitle: 'Edit Product', activePage: 'products', product: productRes.rows[0], categories: categoriesRes.rows, branches: branchesRes.rows });
  } catch (err) {
    res.redirect('/products');
  }
});

router.post('/edit/:id', async (req, res) => {
  const { code, name, category_id, unit_price, cost_price, reorder_level, unit, hsn_code, gst_rate, description } = req.body;
  try {
    const db = getDb();
    const branchesRes = await db.query('SELECT name FROM branches');
    const branch_stocks = {};
    let total_stock = 0;
    for (const b of branchesRes.rows) {
      const stock = parseInt(req.body[`branch_${b.name}`]) || 0;
      branch_stocks[b.name] = stock;
      total_stock += stock;
    }

    await db.query(`
      UPDATE products 
      SET code = $1, name = $2, category_id = $3, unit_price = $4, cost_price = $5, stock_quantity = $6, branch_stocks = $7, reorder_level = $8, unit = $9, hsn_code = $10, gst_rate = $11, description = $12, updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
    `, [code, name, category_id || null, unit_price, cost_price, total_stock, branch_stocks, reorder_level, unit, hsn_code, gst_rate, description, req.params.id]);
    req.session.success = 'Product updated successfully!';
    res.redirect('/products');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to update product';
    res.redirect(`/products/edit/${req.params.id}`);
  }
});

router.post('/delete/:id', async (req, res) => {
  try {
    await getDb().query('UPDATE products SET is_active = 0 WHERE id = $1', [req.params.id]);
    req.session.success = 'Product deleted successfully!';
  } catch (err) {
    req.session.error = 'Failed to delete product';
  }
  res.redirect('/products');
});

router.post('/bulk-delete', async (req, res) => {
  let ids = req.body.product_ids;
  if (typeof ids === 'string') ids = JSON.parse(ids);
  if (!ids || ids.length === 0) return res.redirect('/products');
  try {
    const placeholders = ids.map((_, i) => '$' + (i + 1)).join(',');
    await getDb().query('UPDATE products SET is_active = 0 WHERE id IN (' + placeholders + ')', ids);
    req.session.success = ids.length + ' products deleted successfully!';
  } catch (err) {
    req.session.error = 'Failed to delete products';
  }
  res.redirect('/products');
});

router.post('/bulk-edit', async (req, res) => {
  let ids = req.body.product_ids;
  if (typeof ids === 'string') ids = JSON.parse(ids);
  if (!ids || ids.length === 0) return res.redirect('/products');
  const field = req.body.field;
  let value = req.body[field];
  if (field === 'category_id' && value === '') value = null;
  try {
    const placeholders = ids.map((_, i) => '$' + (i + 2)).join(',');
    await getDb().query('UPDATE products SET ' + field + ' = $1 WHERE id IN (' + placeholders + ')', [value, ...ids]);
    req.session.success = ids.length + ' products updated successfully!';
  } catch (err) {
    req.session.error = 'Failed to update products';
  }
  res.redirect('/products');
});

module.exports = router;
