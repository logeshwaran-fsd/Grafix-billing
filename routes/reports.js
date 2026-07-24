const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', (req, res) => {
  res.render('reports/landing', { pageTitle: 'Reports', activePage: 'reports' });
});

router.get('/sales', (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  try {
    const db = getDb();
    const sales = db.prepare(`
      SELECT date(created_at) as date, COUNT(id) as count, SUM(total_amount) as total, SUM(tax_amount) as tax
      FROM invoices
      WHERE date(created_at) >= ? AND date(created_at) <= ? AND payment_status != 'cancelled'
      GROUP BY date(created_at)
      ORDER BY date(created_at) DESC
    `).all(from, to);

    const summary = db.prepare(`
      SELECT COUNT(id) as count, SUM(total_amount) as total
      FROM invoices
      WHERE date(created_at) >= ? AND date(created_at) <= ? AND payment_status != 'cancelled'
    `).get(from, to);

    res.render('reports/sales', { pageTitle: 'Sales Report', activePage: 'reports', sales, from, to, summary });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch sales reports', activePage: 'reports' });
  }
});

router.get('/api/sales', (req, res) => {
  const from = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  try {
    const db = getDb();
    const data = db.prepare(`
      SELECT date(created_at) as date, SUM(total_amount) as total, COUNT(id) as count
      FROM invoices
      WHERE date(created_at) >= ? AND date(created_at) <= ? AND payment_status != 'cancelled'
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `).all(from, to);
    res.json(data);
  } catch (err) {
    res.status(500).json([]);
  }
});

router.get('/stock', (req, res) => {
  try {
    const db = getDb();
    const products = db.prepare(`
      SELECT name, code, stock_quantity, cost_price, unit_price,
             (stock_quantity * cost_price) as cost_value,
             (stock_quantity * unit_price) as sale_value
      FROM products 
      WHERE is_active = 1
      ORDER BY stock_quantity DESC
    `).all();

    const totals = db.prepare(`
      SELECT 
        SUM(stock_quantity) as total_qty,
        SUM(stock_quantity * cost_price) as total_cost,
        SUM(stock_quantity * unit_price) as total_sale
      FROM products WHERE is_active = 1
    `).get();

    res.render('reports/stock', { pageTitle: 'Stock Valuation', activePage: 'reports', products, totals });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to generate stock reports', activePage: 'reports' });
  }
});

router.get('/top-products', (req, res) => {
  try {
    const db = getDb();
    const topProducts = db.prepare(`
      SELECT ii.product_name, ii.product_code, SUM(ii.quantity) as qty_sold, SUM(ii.total) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.payment_status != 'cancelled'
      GROUP BY ii.product_id
      ORDER BY qty_sold DESC
      LIMIT 10
    `).all();
    res.render('reports/top', { pageTitle: 'Top Selling Products', activePage: 'reports', topProducts });
  } catch (err) {
    res.redirect('/reports');
  }
});

module.exports = router;
