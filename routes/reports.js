const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', (req, res) => {
  res.render('reports/landing', { pageTitle: 'Reports', activePage: 'reports' });
});

router.get('/sales', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  try {
    const db = getDb();
    const salesRes = await db.query(`
      SELECT CAST(created_at AS DATE) as date, COUNT(id) as count, SUM(total_amount) as total, SUM(tax_amount) as tax
      FROM invoices
      WHERE CAST(created_at AS DATE) >= $1 AND CAST(created_at AS DATE) <= $2 AND payment_status != 'cancelled'
      GROUP BY CAST(created_at AS DATE)
      ORDER BY CAST(created_at AS DATE) DESC
    `, [from, to]);
    const sales = salesRes.rows;

    const summaryRes = await db.query(`
      SELECT COUNT(id) as count, SUM(total_amount) as total
      FROM invoices
      WHERE CAST(created_at AS DATE) >= $1 AND CAST(created_at AS DATE) <= $2 AND payment_status != 'cancelled'
    `, [from, to]);
    const summary = summaryRes.rows[0];

    res.render('reports/sales', { pageTitle: 'Sales Report', activePage: 'reports', sales, from, to, summary });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch sales reports', activePage: 'reports' });
  }
});

router.get('/api/sales', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  try {
    const db = getDb();
    const dataRes = await db.query(`
      SELECT CAST(created_at AS DATE) as date, SUM(total_amount) as total, COUNT(id) as count
      FROM invoices
      WHERE CAST(created_at AS DATE) >= $1 AND CAST(created_at AS DATE) <= $2 AND payment_status != 'cancelled'
      GROUP BY CAST(created_at AS DATE)
      ORDER BY CAST(created_at AS DATE) ASC
    `, [from, to]);
    res.json(dataRes.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

router.get('/stock', async (req, res) => {
  try {
    const db = getDb();
    const productsRes = await db.query(`
      SELECT name, code, stock_quantity, cost_price, unit_price,
             (stock_quantity * cost_price) as cost_value,
             (stock_quantity * unit_price) as sale_value
      FROM products 
      WHERE is_active = 1
      ORDER BY stock_quantity DESC
    `);
    const products = productsRes.rows;

    const totalsRes = await db.query(`
      SELECT 
        SUM(stock_quantity) as total_qty,
        SUM(stock_quantity * cost_price) as total_cost,
        SUM(stock_quantity * unit_price) as total_sale
      FROM products WHERE is_active = 1
    `);
    const totals = totalsRes.rows[0];

    res.render('reports/stock', { pageTitle: 'Stock Valuation', activePage: 'reports', products, totals });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to generate stock reports', activePage: 'reports' });
  }
});

router.get('/top-products', async (req, res) => {
  try {
    const db = getDb();
    const topProductsRes = await db.query(`
      SELECT ii.product_name, ii.product_code, SUM(ii.quantity) as qty_sold, SUM(ii.total) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.payment_status != 'cancelled'
      GROUP BY ii.product_id, ii.product_name, ii.product_code
      ORDER BY qty_sold DESC
      LIMIT 10
    `);
    res.render('reports/top', { pageTitle: 'Top Selling Products', activePage: 'reports', topProducts: topProductsRes.rows });
  } catch (err) {
    res.redirect('/reports');
  }
});

module.exports = router;
