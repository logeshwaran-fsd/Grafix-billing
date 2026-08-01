const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
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

router.get('/export/sales', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  try {
    const db = getDb();
    const invRes = await db.query(`
      SELECT i.invoice_number, i.created_at::date as invoice_date, i.invoice_type, 
             c.name as customer_name, c.phone as customer_phone, c.city as customer_city,
             i.payment_method, i.payment_status, i.subtotal, i.discount_amount, i.tax_amount, i.total_amount
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE CAST(i.created_at AS DATE) >= $1 AND CAST(i.created_at AS DATE) <= $2 AND i.payment_status != 'cancelled'
      ORDER BY i.created_at DESC
    `, [from, to]);

    const data = invRes.rows.map(r => ({
      'Invoice #': r.invoice_number,
      'Date': new Date(r.invoice_date).toLocaleDateString('en-IN'),
      'Type': r.invoice_type ? r.invoice_type.toUpperCase() : 'GST',
      'Customer Name': r.customer_name || 'Walk-in Customer',
      'Phone': r.customer_phone || '',
      'City': r.customer_city || '',
      'Payment Method': (r.payment_method || '').toUpperCase(),
      'Payment Status': (r.payment_status || '').toUpperCase(),
      'Subtotal (₹)': parseFloat(r.subtotal || 0).toFixed(2),
      'Discount (₹)': parseFloat(r.discount_amount || 0).toFixed(2),
      'GST Tax (₹)': parseFloat(r.tax_amount || 0).toFixed(2),
      'Total Amount (₹)': parseFloat(r.total_amount || 0).toFixed(2)
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Sales Report');

    const filePath = path.join(__dirname, '../uploads/sales_report.xlsx');
    xlsx.writeFile(wb, filePath);
    res.download(filePath, `SalesReport_${from}_to_${to}.xlsx`, () => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
  } catch (err) {
    req.session.error = 'Failed to export sales report';
    res.redirect('/reports/sales');
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
      SELECT name, code, stock_quantity, cost_price, unit_price, branch_stocks,
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

router.get('/export/stock', async (req, res) => {
  try {
    const db = getDb();
    const branchesRes = await db.query('SELECT name FROM branches ORDER BY name ASC');
    const branches = branchesRes.rows.map(b => b.name);

    const productsRes = await db.query(`
      SELECT p.code, p.name, c.name as category, p.stock_quantity, p.branch_stocks, p.cost_price, p.unit_price, p.reorder_level, p.unit
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1
      ORDER BY p.code ASC
    `);

    const data = productsRes.rows.map(p => {
      const item = {
        'Product Code': p.code,
        'Product Name': p.name,
        'Category / Brand': p.category || 'Unbranded',
        'Total Stock': p.stock_quantity,
      };
      branches.forEach(b => {
        item[`${b} Stock`] = (p.branch_stocks && p.branch_stocks[b] !== undefined) ? p.branch_stocks[b] : 0;
      });
      item['Unit'] = p.unit;
      item['Cost Price (₹)'] = parseFloat(p.cost_price || 0).toFixed(2);
      item['Selling Price (₹)'] = parseFloat(p.unit_price || 0).toFixed(2);
      item['Stock Cost Value (₹)'] = (p.stock_quantity * (p.cost_price || 0)).toFixed(2);
      item['Stock Retail Value (₹)'] = (p.stock_quantity * (p.unit_price || 0)).toFixed(2);
      item['Reorder Level'] = p.reorder_level;
      return item;
    });

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Stock Valuation');

    const filePath = path.join(__dirname, '../uploads/stock_valuation_report.xlsx');
    xlsx.writeFile(wb, filePath);
    res.download(filePath, 'Stock_Valuation_Report.xlsx', () => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
  } catch (err) {
    req.session.error = 'Failed to export stock report';
    res.redirect('/reports/stock');
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
      LIMIT 50
    `);
    res.render('reports/top', { pageTitle: 'Top Selling Products', activePage: 'reports', topProducts: topProductsRes.rows });
  } catch (err) {
    res.redirect('/reports');
  }
});

router.get('/export/top-products', async (req, res) => {
  try {
    const db = getDb();
    const topProductsRes = await db.query(`
      SELECT ii.product_code, ii.product_name, SUM(ii.quantity) as qty_sold, SUM(ii.total) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.payment_status != 'cancelled'
      GROUP BY ii.product_id, ii.product_name, ii.product_code
      ORDER BY qty_sold DESC
    `);

    const data = topProductsRes.rows.map((r, idx) => ({
      'Rank': idx + 1,
      'Product Code': r.product_code,
      'Product Name': r.product_name,
      'Quantity Sold': parseInt(r.qty_sold || 0, 10),
      'Total Sales Revenue (₹)': parseFloat(r.total_revenue || 0).toFixed(2)
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Top Selling Products');

    const filePath = path.join(__dirname, '../uploads/top_selling_products.xlsx');
    xlsx.writeFile(wb, filePath);
    res.download(filePath, 'Top_Selling_Products_Report.xlsx', () => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
  } catch (err) {
    req.session.error = 'Failed to export top products report';
    res.redirect('/reports/top-products');
  }
});

module.exports = router;
