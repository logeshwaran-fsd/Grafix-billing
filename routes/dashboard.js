const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const todaySales = db.prepare(`
      SELECT COUNT(id) as count, SUM(total_amount) as total 
      FROM invoices 
      WHERE date(created_at) = date('now') AND payment_status != 'cancelled'
    `).get();
    const totalProducts = db.prepare('SELECT COUNT(id) as count FROM products WHERE is_active = 1').get().count;
    const lowStockCount = db.prepare('SELECT COUNT(id) as count FROM products WHERE stock_quantity <= reorder_level AND is_active = 1').get().count;
    const totalCustomers = db.prepare('SELECT COUNT(id) as count FROM customers').get().count;
    const recentInvoices = db.prepare(`
      SELECT i.*, c.name as customer_name 
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      ORDER BY i.created_at DESC
      LIMIT 10
    `).all();
    const lowStockItems = db.prepare(`
      SELECT id, name, code, stock_quantity, reorder_level, unit 
      FROM products 
      WHERE stock_quantity <= reorder_level AND is_active = 1
      ORDER BY stock_quantity ASC
      LIMIT 5
    `).all();
    const salesData = db.prepare(`
      SELECT date(created_at) as date, SUM(total_amount) as total
      FROM invoices
      WHERE created_at >= date('now', '-7 days') AND payment_status != 'cancelled'
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `).all();

    res.render('dashboard', {
      pageTitle: 'Dashboard',
      activePage: 'dashboard',
      todaySales,
      totalProducts,
      lowStockCount,
      totalCustomers,
      recentInvoices,
      lowStockItems,
      salesData
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to load dashboard data', activePage: 'dashboard' });
  }
});

module.exports = router;
