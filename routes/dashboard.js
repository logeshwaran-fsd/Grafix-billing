const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    
    const todaySalesRes = await db.query(`
      SELECT COUNT(id) as count, SUM(total_amount) as total 
      FROM invoices 
      WHERE DATE(created_at) = CURRENT_DATE AND payment_status != 'cancelled'
    `);
    const todaySales = todaySalesRes.rows[0] || { count: 0, total: 0 };
    
    const totalProductsRes = await db.query('SELECT COUNT(id) as count FROM products WHERE is_active = 1');
    const totalProducts = totalProductsRes.rows[0].count;
    
    const lowStockCountRes = await db.query('SELECT COUNT(id) as count FROM products WHERE stock_quantity <= reorder_level AND is_active = 1');
    const lowStockCount = lowStockCountRes.rows[0].count;
    
    const totalCustomersRes = await db.query('SELECT COUNT(id) as count FROM customers');
    const totalCustomers = totalCustomersRes.rows[0].count;
    
    const recentInvoicesRes = await db.query(`
      SELECT i.*, c.name as customer_name 
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      ORDER BY i.created_at DESC
      LIMIT 10
    `);
    const recentInvoices = recentInvoicesRes.rows;
    
    const lowStockItemsRes = await db.query(`
      SELECT id, name, code, stock_quantity, reorder_level, unit 
      FROM products 
      WHERE stock_quantity <= reorder_level AND is_active = 1
      ORDER BY stock_quantity ASC
      LIMIT 5
    `);
    const lowStockItems = lowStockItemsRes.rows;
    
    const salesDataRes = await db.query(`
      SELECT DATE(created_at) as date, SUM(total_amount) as total
      FROM invoices
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND payment_status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `);
    const salesData = salesDataRes.rows;

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
