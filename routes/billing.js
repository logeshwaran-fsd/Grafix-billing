const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', (req, res) => {
  const search = req.query.search || '';
  const status = req.query.status || '';
  const from = req.query.from || '';
  const to = req.query.to || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  try {
    const db = getDb();
    let query = `
      SELECT i.*, c.name as customer_name 
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push('(i.invoice_number LIKE ? OR c.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      conditions.push('i.payment_status = ?');
      params.push(status);
    }
    if (from) {
      conditions.push('date(i.created_at) >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('date(i.created_at) <= ?');
      params.push(to);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const countQuery = `
      SELECT COUNT(i.id) as count 
      FROM invoices i 
      LEFT JOIN customers c ON i.customer_id = c.id
      ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
    `;
    const totalCount = db.prepare(countQuery).get(...params).count;
    const totalPages = Math.ceil(totalCount / limit);

    query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const invoices = db.prepare(query).all(...params);
    res.render('billing/list', { 
      pageTitle: 'Invoices', 
      activePage: 'billing', 
      invoices, 
      search, 
      selectedStatus: status, 
      from, 
      to, 
      pagination: { page, totalPages } 
    });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch invoices', activePage: 'billing' });
  }
});

router.get('/new', (req, res) => {
  const cloneId = req.query.clone;
  let cloneData = null;
  if (cloneId) {
    try {
      const db = getDb();
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(cloneId);
      if (invoice) {
        const items = db.prepare('SELECT product_id, product_name, product_code, quantity, unit_price, discount, tax_rate FROM invoice_items WHERE invoice_id = ?').all(cloneId);
        const customerName = db.prepare('SELECT name FROM customers WHERE id = ?').get(invoice.customer_id)?.name || 'Walk-in Customer';
        cloneData = {
          customer_id: invoice.customer_id,
          customer_name: customerName,
          notes: invoice.notes,
          discount: invoice.discount_amount,
          payment_method: invoice.payment_method,
          payment_status: invoice.payment_status,
          invoice_type: invoice.invoice_type,
          items: items.map(item => ({
            product_id: item.product_id,
            code: item.product_code,
            name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount,
            original_tax_rate: item.tax_rate,
            tax_rate: item.tax_rate,
            stock_quantity: 999999
          }))
        };
      }
    } catch (err) {
      console.error(err);
    }
  }
  res.render('billing/new', { pageTitle: 'New Invoice', activePage: 'billing-new', cloneData });
});

router.post('/create', (req, res) => {
  const { customer_id, payment_method, payment_status, notes, items, overall_discount, invoice_type } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Cannot create empty invoice' });
  }
  
  const type = invoice_type === 'estimate' ? 'estimate' : 'gst';
  const db = getDb();
  const tx = db.transaction(() => {
    const date = new Date();
    const year = date.getFullYear().toString().substring(2);
    const prefix = (type === 'estimate' ? 'EST' : 'INV') + year;
    const lastInv = db.prepare("SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1").get(`${prefix}%`);
    let nextNum = 1;
    if (lastInv) {
      const parts = lastInv.invoice_number.split('-');
      if (parts.length > 1) {
        nextNum = parseInt(parts[1]) + 1;
      }
    }
    const invoice_number = `${prefix}-${nextNum.toString().padStart(4, '0')}`;

    let subtotal = 0;
    let tax_amount = 0;
    let discount_amount = parseFloat(overall_discount) || 0;

    const validatedItems = [];
    for (const item of items) {
      const prod = db.prepare('SELECT id, name, code, stock_quantity, unit_price FROM products WHERE id = ? AND is_active = 1').get(item.product_id);
      if (!prod) throw new Error(`Product ${item.product_name} not found or inactive`);
      if (prod.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${prod.name}. Available: ${prod.stock_quantity}`);
      }
      const isEstimate = (type === 'estimate');
      const itemTaxRate = isEstimate ? 0 : parseFloat(item.tax_rate || 0);
      const lineSubtotal = item.quantity * prod.unit_price;
      const lineDisc = parseFloat(item.discount) || 0;
      const lineTax = isEstimate ? 0 : (lineSubtotal - lineDisc) * (itemTaxRate / 100);
      subtotal += lineSubtotal;
      tax_amount += lineTax;
      discount_amount += lineDisc;

      validatedItems.push({
        product_id: prod.id,
        product_name: prod.name,
        product_code: prod.code,
        quantity: item.quantity,
        unit_price: prod.unit_price,
        discount: lineDisc,
        tax_rate: itemTaxRate,
        tax_amount: lineTax,
        total: lineSubtotal - lineDisc + lineTax
      });
    }

    const total_amount = subtotal - discount_amount + tax_amount;

    const invoiceResult = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, user_id, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status, notes, invoice_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoice_number, customer_id, req.session.user.id, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status, notes, type);

    const invoiceId = invoiceResult.lastInsertRowid;

    const insertItemStmt = db.prepare(`
      INSERT INTO invoice_items (invoice_id, product_id, product_name, product_code, quantity, unit_price, discount, tax_rate, tax_amount, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStockStmt = db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?');
    const insertStockTxStmt = db.prepare(`
      INSERT INTO stock_transactions (product_id, type, quantity, reference_id, notes, user_id)
      VALUES (?, 'sale', ?, ?, 'Sale Invoice', ?)
    `);

    for (const item of validatedItems) {
      insertItemStmt.run(invoiceId, item.product_id, item.product_name, item.product_code, item.quantity, item.unit_price, item.discount, item.tax_rate, item.tax_amount, item.total);
      updateStockStmt.run(item.quantity, item.product_id);
      insertStockTxStmt.run(item.product_id, -item.quantity, invoiceId, req.session.user.id);
    }

    return invoiceId;
  });

  try {
    const invoiceId = tx();
    res.json({ success: true, invoiceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const invoice = db.prepare(`
      SELECT i.*, c.name as customer_name, c.phone as customer_phone, c.gstin as customer_gstin, c.address as customer_address, u.full_name as billed_by
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN users u ON i.user_id = u.id
      WHERE i.id = ?
    `).get(req.params.id);
    if (!invoice) return res.redirect('/billing');
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
    res.render('billing/view', { pageTitle: 'Invoice Detail', activePage: 'billing', invoice, items });
  } catch (err) {
    res.redirect('/billing');
  }
});

router.post('/:id/cancel', (req, res) => {
  const db = getDb();
  const tx = db.transaction(() => {
    const inv = db.prepare('SELECT id, payment_status FROM invoices WHERE id = ?').get(req.params.id);
    if (!inv || inv.payment_status === 'cancelled') return;
    
    const items = db.prepare('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
    
    const updateStockStmt = db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?');
    const insertStockTxStmt = db.prepare(`
      INSERT INTO stock_transactions (product_id, type, quantity, reference_id, notes, user_id)
      VALUES (?, 'return', ?, ?, 'Cancelled Invoice', ?)
    `);
    
    for (const item of items) {
      updateStockStmt.run(item.quantity, item.product_id);
      insertStockTxStmt.run(item.product_id, item.quantity, req.params.id, req.session.user.id);
    }
    
    db.prepare("UPDATE invoices SET payment_status = 'cancelled' WHERE id = ?").run(req.params.id);
  });
  
  try {
    tx();
    req.session.success = 'Invoice cancelled successfully!';
  } catch (err) {
    req.session.error = 'Failed to cancel invoice';
  }
  res.redirect(`/billing/${req.params.id}`);
});

module.exports = router;
