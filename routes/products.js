const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const db = getDb();
    let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1';
    const params = [];

    if (search) {
      query += ' AND (p.name LIKE ? OR p.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      query += ' AND p.category_id = ?';
      params.push(category);
    }

    const totalCountQuery = query.replace('p.*, c.name as category_name', 'COUNT(p.id) as count');
    const totalCount = db.prepare(totalCountQuery).get(...params).count;
    const totalPages = Math.ceil(totalCount / limit);

    query += ' ORDER BY p.code ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const products = db.prepare(query).all(...params);
    const categories = db.prepare('SELECT * FROM categories').all();

    res.render('products/list', {
      pageTitle: 'Products',
      activePage: 'products',
      products,
      categories,
      search,
      selectedCategory: category,
      pagination: { page, totalPages }
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch products', activePage: 'products' });
  }
});

router.get('/api/search', (req, res) => {
  const q = req.query.q || '';
  try {
    const db = getDb();
    const products = db.prepare(`
      SELECT id, code, name, unit_price, stock_quantity, gst_rate 
      FROM products 
      WHERE (name LIKE ? OR code LIKE ?) AND is_active = 1
      LIMIT 10
    `).all(`${q}%`, `${q}%`);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/history/:id', (req, res) => {
  try {
    const db = getDb();
    // Get the last 10 purchases of this product, showing customer and date
    const history = db.prepare(`
      SELECT c.name as customer_name, i.date as invoice_date, ii.quantity, ii.unit_price
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE ii.product_id = ?
      ORDER BY i.date DESC
      LIMIT 10
    `).all(req.params.id);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/add', (req, res) => {
  try {
    const categories = getDb().prepare('SELECT * FROM categories').all();
    res.render('products/form', { pageTitle: 'Add Product', activePage: 'products', product: null, categories });
  } catch (err) {
    res.redirect('/products');
  }
});

router.post('/add', (req, res) => {
  const { code, name, category_id, unit_price, cost_price, stock_quantity, reorder_level, unit, hsn_code, gst_rate, description } = req.body;
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO products (code, name, category_id, unit_price, cost_price, stock_quantity, reorder_level, unit, hsn_code, gst_rate, description) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, name, category_id || null, unit_price, cost_price, stock_quantity, reorder_level, unit, hsn_code, gst_rate, description);
    req.session.success = 'Product added successfully!';
    res.redirect('/products');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to add product: Code must be unique';
    res.redirect('/products/add');
  }
});

router.post('/api/quick-add', (req, res) => {
  const { code, name, unit_price, cost_price, stock_quantity, gst_rate } = req.body;
  if (!code || !name) return res.status(400).json({ success: false, error: 'Code and Name are required' });
  try {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO products (code, name, unit_price, cost_price, stock_quantity, reorder_level, unit, gst_rate, is_active) 
      VALUES (?, ?, ?, ?, ?, 10, 'pcs', ?, 1)
    `).run(code, name, unit_price || 0, cost_price || 0, stock_quantity || 0, gst_rate || 18);
    res.json({ success: true, product: { id: result.lastInsertRowid, code, name, unit_price: unit_price || 0, stock_quantity: stock_quantity || 0, gst_rate: gst_rate || 18 } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add product (code might not be unique)' });
  }
});

router.get('/edit/:id', (req, res) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    const categories = db.prepare('SELECT * FROM categories').all();
    if (!product) return res.redirect('/products');
    res.render('products/form', { pageTitle: 'Edit Product', activePage: 'products', product, categories });
  } catch (err) {
    res.redirect('/products');
  }
});

router.post('/edit/:id', (req, res) => {
  const { code, name, category_id, unit_price, cost_price, reorder_level, unit, hsn_code, gst_rate, description } = req.body;
  try {
    const db = getDb();
    db.prepare(`
      UPDATE products 
      SET code = ?, name = ?, category_id = ?, unit_price = ?, cost_price = ?, reorder_level = ?, unit = ?, hsn_code = ?, gst_rate = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(code, name, category_id || null, unit_price, cost_price, reorder_level, unit, hsn_code, gst_rate, description, req.params.id);
    req.session.success = 'Product updated successfully!';
    res.redirect('/products');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to update product';
    res.redirect(`/products/edit/${req.params.id}`);
  }
});

router.post('/delete/:id', (req, res) => {
  try {
    getDb().prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
    req.session.success = 'Product deleted successfully!';
  } catch (err) {
    req.session.error = 'Failed to delete product';
  }
  res.redirect('/products');
});

module.exports = router;
