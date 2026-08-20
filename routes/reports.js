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
  const selectedProduct = req.query.product_id || '';
  const selectedCategory = req.query.category_id || '';
  const selectedBranch = req.query.branch || '';

  try {
    const db = getDb();
    
    // Fetch product, category, and branch filter options
    const productsRes = await db.query("SELECT id, name, code FROM products WHERE is_active = 1 ORDER BY CASE WHEN code ~ '^[0-9]+$' THEN LPAD(code, 10, '0') ELSE code END ASC");
    const productsList = productsRes.rows;
    
    const categoriesRes = await db.query("SELECT id, name FROM categories ORDER BY name ASC");
    const categoriesList = categoriesRes.rows;

    const branchesRes = await db.query("SELECT name FROM branches ORDER BY name ASC");
    const branchesList = branchesRes.rows.map(b => b.name);

    // Build conditions for invoice items query
    let itemFilterSql = "CAST(i.created_at AS DATE) >= $1 AND CAST(i.created_at AS DATE) <= $2 AND i.payment_status != 'cancelled'";
    const params = [from, to];
    let pIdx = 3;

    if (selectedProduct) {
      itemFilterSql += ` AND ii.product_id = $${pIdx++}`;
      params.push(selectedProduct);
    }
    if (selectedCategory) {
      itemFilterSql += ` AND p.category_id = $${pIdx++}`;
      params.push(selectedCategory);
    }
    if (selectedBranch) {
      itemFilterSql += ` AND i.branch = $${pIdx++}`;
      params.push(selectedBranch);
    }

    // 1. Item-wise sales breakdown (How much stock sold in the date range)
    const itemSalesRes = await db.query(`
      SELECT 
        ii.product_id,
        ii.product_code,
        ii.product_name,
        COALESCE(c.name, 'Unbranded') as category_name,
        COALESCE(SUM(ii.quantity), 0) as total_qty_sold,
        COALESCE(AVG(ii.unit_price), 0) as avg_price,
        COALESCE(SUM(ii.tax_amount), 0) as total_tax,
        COALESCE(SUM(ii.total), 0) as total_revenue,
        COALESCE(p.stock_quantity, 0) as current_stock,
        COALESCE(p.unit, 'pcs') as unit
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN products p ON ii.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${itemFilterSql}
      GROUP BY ii.product_id, ii.product_code, ii.product_name, c.name, p.stock_quantity, p.unit
      ORDER BY total_qty_sold DESC
    `, params);
    const itemSales = itemSalesRes.rows;

    // 2. Daily Sales Trend
    const salesTrendRes = await db.query(`
      SELECT 
        CAST(i.created_at AS DATE) as date, 
        COUNT(DISTINCT i.id) as count, 
        COALESCE(SUM(ii.quantity), 0) as total_qty_sold,
        COALESCE(SUM(ii.tax_amount), 0) as tax,
        COALESCE(SUM(ii.total), 0) as total
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE ${itemFilterSql}
      GROUP BY CAST(i.created_at AS DATE)
      ORDER BY CAST(i.created_at AS DATE) DESC
    `, params);
    const sales = salesTrendRes.rows;

    // 3. Summary metrics
    const summaryRes = await db.query(`
      SELECT 
        COUNT(DISTINCT i.id) as count,
        COALESCE(SUM(ii.quantity), 0) as total_qty_sold,
        COALESCE(SUM(ii.total), 0) as total,
        COALESCE(SUM(ii.tax_amount), 0) as tax
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE ${itemFilterSql}
    `, params);
    const summary = summaryRes.rows[0] || { count: 0, total_qty_sold: 0, total: 0, tax: 0 };

    res.render('reports/sales', { 
      pageTitle: 'Sales Report', 
      activePage: 'reports', 
      sales, 
      from, 
      to, 
      summary, 
      itemSales,
      productsList,
      categoriesList,
      branchesList,
      selectedProduct,
      selectedCategory,
      selectedBranch
    });
  } catch (err) {
    console.error('Sales report error:', err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch sales reports: ' + err.message, activePage: 'reports' });
  }
});

router.get('/export/sales', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  const selectedProduct = req.query.product_id || '';
  const selectedCategory = req.query.category_id || '';
  const selectedBranch = req.query.branch || '';

  try {
    const db = getDb();
    
    let itemFilterSql = "CAST(i.created_at AS DATE) >= $1 AND CAST(i.created_at AS DATE) <= $2 AND i.payment_status != 'cancelled'";
    const params = [from, to];
    let pIdx = 3;

    if (selectedProduct) {
      itemFilterSql += ` AND ii.product_id = $${pIdx++}`;
      params.push(selectedProduct);
    }
    if (selectedCategory) {
      itemFilterSql += ` AND p.category_id = $${pIdx++}`;
      params.push(selectedCategory);
    }
    if (selectedBranch) {
      itemFilterSql += ` AND i.branch = $${pIdx++}`;
      params.push(selectedBranch);
    }

    // 1. Item-wise sales breakdown
    const itemSalesRes = await db.query(`
      SELECT 
        ii.product_code,
        ii.product_name,
        COALESCE(c.name, 'Unbranded') as category_name,
        COALESCE(SUM(ii.quantity), 0) as total_qty_sold,
        COALESCE(p.unit, 'pcs') as unit,
        COALESCE(AVG(ii.unit_price), 0) as avg_unit_price,
        COALESCE(SUM(ii.tax_amount), 0) as total_tax,
        COALESCE(SUM(ii.total), 0) as total_revenue,
        COALESCE(p.stock_quantity, 0) as current_stock
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN products p ON ii.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${itemFilterSql}
      GROUP BY ii.product_code, ii.product_name, c.name, p.stock_quantity, p.unit
      ORDER BY total_qty_sold DESC
    `, params);

    const itemData = itemSalesRes.rows.map((r, idx) => ({
      '#': idx + 1,
      'Product Code': r.product_code,
      'Product Name': r.product_name,
      'Brand / Category': r.category_name,
      'Qty Sold (In Date Range)': Number(r.total_qty_sold),
      'Unit': r.unit,
      'Avg Selling Price (₹)': parseFloat(r.avg_unit_price).toFixed(2),
      'GST Tax (₹)': parseFloat(r.total_tax).toFixed(2),
      'Total Sales Revenue (₹)': parseFloat(r.total_revenue).toFixed(2),
      'Current Remaining Stock': Number(r.current_stock)
    }));

    // 2. Invoice Details List
    const invRes = await db.query(`
      SELECT i.invoice_number, i.created_at::date as invoice_date, i.branch, i.invoice_type, 
             c.name as customer_name, c.phone as customer_phone, c.city as customer_city,
             ii.product_code, ii.product_name, ii.quantity, ii.unit_price, ii.total as line_total,
             i.payment_method, i.payment_status
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN products p ON ii.product_id = p.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE ${itemFilterSql}
      ORDER BY i.created_at DESC
    `, params);

    const invoiceData = invRes.rows.map(r => ({
      'Invoice #': r.invoice_number,
      'Date': new Date(r.invoice_date).toLocaleDateString('en-IN'),
      'Branch': r.branch || 'Main',
      'Customer': r.customer_name || 'Walk-in Customer',
      'Phone': r.customer_phone || '',
      'Product Code': r.product_code,
      'Product Name': r.product_name,
      'Quantity': Number(r.quantity),
      'Unit Price (₹)': parseFloat(r.unit_price || 0).toFixed(2),
      'Line Total (₹)': parseFloat(r.line_total || 0).toFixed(2),
      'Payment Status': (r.payment_status || '').toUpperCase()
    }));

    const wb = xlsx.utils.book_new();
    const wsItems = xlsx.utils.json_to_sheet(itemData);
    xlsx.utils.book_append_sheet(wb, wsItems, 'Stock Sold by Product');

    const wsInvoices = xlsx.utils.json_to_sheet(invoiceData);
    xlsx.utils.book_append_sheet(wb, wsInvoices, 'Detailed Line Items');

    const filePath = path.join(__dirname, '../uploads/sales_report.xlsx');
    xlsx.writeFile(wb, filePath);
    res.download(filePath, `ItemSalesReport_${from}_to_${to}.xlsx`, () => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error('Export error:', err);
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
