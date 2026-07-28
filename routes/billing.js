const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res) => {
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
      conditions.push(`(i.invoice_number ILIKE $${params.length + 1} OR c.name ILIKE $${params.length + 2})`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
      params.push(status);
      conditions.push(`i.payment_status = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`DATE(i.created_at) >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`DATE(i.created_at) <= $${params.length}`);
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
    const countRes = await db.query(countQuery, params);
    const totalCount = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalCount / limit);

    params.push(limit, offset);
    query += ` ORDER BY i.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const invoicesRes = await db.query(query, params);
    const invoices = invoicesRes.rows;
    
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
    console.error(err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch invoices', activePage: 'billing' });
  }
});

router.get('/new', async (req, res) => {
  const cloneId = req.query.clone;
  let cloneData = null;
  const db = getDb();
  try {
    const branchesRes = await db.query('SELECT name FROM branches ORDER BY name ASC');
    const branches = branchesRes.rows.map(b => b.name);
    
    if (cloneId) {
      const invoiceRes = await db.query('SELECT * FROM invoices WHERE id = $1', [cloneId]);
      const invoice = invoiceRes.rows[0];
      if (invoice) {
        const itemsRes = await db.query('SELECT product_id, product_name, product_code, quantity, unit_price, discount, tax_rate FROM invoice_items WHERE invoice_id = $1', [cloneId]);
        const items = itemsRes.rows;
        let customerName = 'Walk-in Customer';
        if (invoice.customer_id) {
          const cRes = await db.query('SELECT name FROM customers WHERE id = $1', [invoice.customer_id]);
          if (cRes.rows[0]) customerName = cRes.rows[0].name;
        }
        cloneData = {
          customer_id: invoice.customer_id,
          customer_name: customerName,
          courier_charges: invoice.courier_charges,
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
    }
    res.render('billing/new', { pageTitle: 'New Invoice', activePage: 'billing-new', cloneData, branches });
  } catch (err) {
    console.error(err);
    res.redirect('/billing');
  }
});

router.post('/create', async (req, res) => {
  const { customer_id, payment_method, payment_status, courier_charges, items, overall_discount, invoice_type, branch, amount_paid, apply_wallet, invoice_date } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Cannot create empty invoice' });
  }
  
  const type = invoice_type === 'estimate' ? 'estimate' : 'gst';
  const db = getDb();
  
  try {
    const invoiceId = await db.transaction(async (client) => {
      const date = new Date();
      const year = date.getFullYear().toString().substring(2);
      const prefix = (type === 'estimate' ? 'EST' : 'INV') + year;
      const lastInvRes = await client.query("SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY id DESC LIMIT 1", [`${prefix}%`]);
      const lastInv = lastInvRes.rows[0];
      
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
        const prodRes = await client.query('SELECT id, name, code, stock_quantity, unit_price FROM products WHERE id = $1 AND is_active = 1', [item.product_id]);
        const prod = prodRes.rows[0];
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

      const total_amount = subtotal - discount_amount + tax_amount + (parseFloat(courier_charges) || 0);
      
      let net_payable = total_amount;
      let applied_wallet = 0;

      if (customer_id && apply_wallet) {
        const custRes = await client.query('SELECT balance FROM customers WHERE id = $1', [customer_id]);
        const cust = custRes.rows[0];
        if (cust && cust.balance < 0) {
          const advance = Math.abs(cust.balance);
          applied_wallet = Math.min(total_amount, advance);
          net_payable = total_amount - applied_wallet;
          
          await client.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [applied_wallet, customer_id]);
        }
      }
      
      const final_amount_paid = amount_paid !== undefined ? parseFloat(amount_paid) : (payment_status === 'paid' ? net_payable : 0);

      const parsedDate = invoice_date ? new Date(invoice_date) : new Date();
      const invoiceResult = await client.query(`
        INSERT INTO invoices (invoice_number, customer_id, user_id, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status, courier_charges, invoice_type, branch, amount_paid, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
      `, [invoice_number, customer_id || null, req.session.user.id, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status, parseFloat(courier_charges) || 0, type, branch, final_amount_paid, parsedDate]);

      const newInvoiceId = invoiceResult.rows[0].id;

      for (const item of validatedItems) {
        await client.query(`
          INSERT INTO invoice_items (invoice_id, product_id, product_name, product_code, quantity, unit_price, discount, tax_rate, tax_amount, total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [newInvoiceId, item.product_id, item.product_name, item.product_code, item.quantity, item.unit_price, item.discount, item.tax_rate, item.tax_amount, item.total]);
        
        await client.query(`
          UPDATE products 
          SET stock_quantity = stock_quantity - $1,
              branch_stocks = jsonb_set(branch_stocks, ARRAY[$2], (COALESCE((branch_stocks->>$2)::numeric, 0) - $1)::text::jsonb)
          WHERE id = $3
        `, [item.quantity, branch, item.product_id]);
        
        await client.query(`
          INSERT INTO stock_transactions (product_id, type, quantity, reference_id, notes, user_id)
          VALUES ($1, 'sale', $2, $3, 'Sale Invoice', $4)
        `, [item.product_id, -item.quantity, newInvoiceId, req.session.user.id]);
      }

      if (customer_id) {
        if (final_amount_paid > net_payable) {
          const excess = final_amount_paid - net_payable;
          await client.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [excess, customer_id]);
        } else if (final_amount_paid < net_payable) {
          const deficit = net_payable - final_amount_paid;
          await client.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [deficit, customer_id]);
        }
      }

      return newInvoiceId;
    });

    res.json({ success: true, invoiceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/edit', async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).send('Access Denied. Admins only.');
  }
  try {
    const db = getDb();
    const branchesRes = await db.query('SELECT name FROM branches ORDER BY name ASC');
    const branches = branchesRes.rows.map(b => b.name);
    
    const invRes = await db.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    const invoice = invRes.rows[0];
    if (!invoice) return res.redirect('/billing');
    
    const itemsRes = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    const items = itemsRes.rows;
    
    let customerName = null;
    if (invoice.customer_id) {
      const cRes = await db.query('SELECT name FROM customers WHERE id = $1', [invoice.customer_id]);
      if (cRes.rows[0]) customerName = cRes.rows[0].name;
    }

    const processedItems = [];
    for (const i of items) {
      const pRes = await db.query('SELECT stock_quantity, gst_rate FROM products WHERE id = $1', [i.product_id]);
      const p = pRes.rows[0];
      processedItems.push({
        product_id: i.product_id,
        code: i.product_code,
        name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        original_unit_price: i.unit_price,
        discount: i.discount,
        tax_rate: i.tax_rate,
        original_tax_rate: p ? p.gst_rate : 18,
        stock_quantity: p ? p.stock_quantity + i.quantity : i.quantity
      });
    }

    const cloneData = {
      customer_id: invoice.customer_id,
      customer_name: customerName,
      payment_method: invoice.payment_method,
      payment_status: invoice.payment_status,
      courier_charges: invoice.courier_charges,
      discount: invoice.discount_amount,
      invoice_type: invoice.invoice_type || 'gst',
      amount_paid: invoice.amount_paid,
      items: processedItems
    };
    
    res.render('billing/new', { pageTitle: 'Edit Invoice ' + invoice.invoice_number, activePage: 'billing', cloneData, editInvoiceId: invoice.id, branches });
  } catch (err) {
    console.error(err);
    res.redirect('/billing');
  }
});

router.post('/:id/edit', async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Access Denied. Admins only.' });
  }

  const invoiceId = req.params.id;
  const { customer_id, payment_method, payment_status, courier_charges, items, overall_discount, invoice_type, branch, amount_paid, apply_wallet, invoice_date } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ success: false, error: 'Cannot create empty invoice' });
  
  const type = invoice_type === 'estimate' ? 'estimate' : 'gst';
  const db = getDb();
  
  try {
    await db.transaction(async (client) => {
      // 1. Fetch old invoice
      const oldInvRes = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
      const oldInvoice = oldInvRes.rows[0];
      if (!oldInvoice) throw new Error('Invoice not found');
      
      const oldItemsRes = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
      const oldItems = oldItemsRes.rows;
      
      // 2. REVERT old invoice stock & balance
      if (oldInvoice.customer_id) {
         const old_diff = oldInvoice.total_amount - oldInvoice.amount_paid;
         await client.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [old_diff, oldInvoice.customer_id]);
      }
      
      for (const item of oldItems) {
        await client.query(`
          UPDATE products 
          SET stock_quantity = stock_quantity + $1,
              branch_stocks = jsonb_set(branch_stocks, ARRAY[$2], (COALESCE((branch_stocks->>$2)::numeric, 0) + $1)::text::jsonb)
          WHERE id = $3
        `, [item.quantity, oldInvoice.branch, item.product_id]);
      }
      await client.query('DELETE FROM stock_transactions WHERE reference_id = $1 AND type = $2', [invoiceId, 'sale']);
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
      
      // 3. VALIDATE new items
      let subtotal = 0;
      let tax_amount = 0;
      let discount_amount = parseFloat(overall_discount) || 0;
      const validatedItems = [];
      
      for (const item of items) {
        const prodRes = await client.query('SELECT id, name, code, stock_quantity FROM products WHERE id = $1', [item.product_id]);
        const prod = prodRes.rows[0];
        if (!prod) throw new Error(`Product ${item.product_name} not found`);
        if (prod.stock_quantity < item.quantity) throw new Error(`Insufficient stock for ${prod.name}`);
        
        const itemTaxRate = type === 'estimate' ? 0 : parseFloat(item.tax_rate || 0);
        const actualUnitPrice = parseFloat(item.unit_price);
        const lineSubtotalActual = item.quantity * actualUnitPrice;
        const lineDisc = parseFloat(item.discount) || 0;
        const lineTax = type === 'estimate' ? 0 : (lineSubtotalActual - lineDisc) * (itemTaxRate / 100);
        
        subtotal += lineSubtotalActual;
        tax_amount += lineTax;
        discount_amount += lineDisc;
        
        validatedItems.push({
          product_id: prod.id,
          product_name: prod.name,
          product_code: prod.code,
          quantity: item.quantity,
          unit_price: actualUnitPrice,
          discount: lineDisc,
          tax_rate: itemTaxRate,
          tax_amount: lineTax,
          total: lineSubtotalActual - lineDisc + lineTax
        });
      }
      
      const total_amount = subtotal - discount_amount + tax_amount + (parseFloat(courier_charges) || 0);
      let net_payable = total_amount;
      let applied_wallet = 0;

      if (customer_id && apply_wallet) {
        const custRes = await client.query('SELECT balance FROM customers WHERE id = $1', [customer_id]);
        const cust = custRes.rows[0];
        if (cust && cust.balance < 0) {
          const advance = Math.abs(cust.balance);
          applied_wallet = Math.min(total_amount, advance);
          net_payable = total_amount - applied_wallet;
          await client.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [applied_wallet, customer_id]);
        }
      }
      
      const final_amount_paid = amount_paid !== undefined ? parseFloat(amount_paid) : (payment_status === 'paid' ? net_payable : 0);

      const parsedDate = invoice_date ? new Date(invoice_date) : new Date();
      // 4. APPLY new invoice
      await client.query(`
        UPDATE invoices SET customer_id=$1, user_id=$2, subtotal=$3, tax_amount=$4, discount_amount=$5, total_amount=$6, payment_method=$7, payment_status=$8, courier_charges=$9, invoice_type=$10, branch=$11, amount_paid=$12, created_at=$14
        WHERE id=$13
      `, [customer_id || null, req.session.user.id, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status, parseFloat(courier_charges) || 0, type, branch, final_amount_paid, invoiceId, parsedDate]);

      for (const item of validatedItems) {
        await client.query(`
          INSERT INTO invoice_items (invoice_id, product_id, product_name, product_code, quantity, unit_price, discount, tax_rate, tax_amount, total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [invoiceId, item.product_id, item.product_name, item.product_code, item.quantity, item.unit_price, item.discount, item.tax_rate, item.tax_amount, item.total]);
        
        await client.query(`
          UPDATE products 
          SET stock_quantity = stock_quantity - $1,
              branch_stocks = jsonb_set(branch_stocks, ARRAY[$2], (COALESCE((branch_stocks->>$2)::numeric, 0) - $1)::text::jsonb)
          WHERE id = $3
        `, [item.quantity, branch, item.product_id]);
        
        await client.query(`
          INSERT INTO stock_transactions (product_id, type, quantity, reference_id, notes, user_id)
          VALUES ($1, 'sale', $2, $3, 'Sale Invoice (Edit)', $4)
        `, [item.product_id, -item.quantity, invoiceId, req.session.user.id]);
      }
      
      if (customer_id) {
        if (final_amount_paid > net_payable) {
          const excess = final_amount_paid - net_payable;
          await client.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [excess, customer_id]);
        } else if (final_amount_paid < net_payable) {
          const deficit = net_payable - final_amount_paid;
          await client.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [deficit, customer_id]);
        }
      }

    });
    
    res.json({ success: true, invoiceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const invRes = await db.query(`
      SELECT i.*, c.name as customer_name, c.phone as customer_phone, c.gstin as customer_gstin, c.address as customer_address, u.full_name as billed_by
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN users u ON i.user_id = u.id
      WHERE i.id = $1
    `, [req.params.id]);
    const invoice = invRes.rows[0];
    if (!invoice) return res.redirect('/billing');
    
    const itemsRes = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    const items = itemsRes.rows;
    
    const download = req.query.download === 'true';
    res.render('billing/view', { pageTitle: 'Invoice Detail', activePage: 'billing', invoice, items, download });
  } catch (err) {
    console.error(err);
    res.redirect('/billing');
  }
});

router.get('/:id/pos', async (req, res) => {
  try {
    const db = getDb();
    const invRes = await db.query(`
      SELECT i.*, c.name as customer_name, c.phone as customer_phone, u.full_name as billed_by
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN users u ON i.user_id = u.id
      WHERE i.id = $1
    `, [req.params.id]);
    const invoice = invRes.rows[0];
    if (!invoice) return res.redirect('/billing');
    
    const itemsRes = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    const items = itemsRes.rows;
    
    res.render('billing/pos', { pageTitle: 'POS Receipt', activePage: 'billing', invoice, items });
  } catch (err) {
    console.error(err);
    res.redirect('/billing');
  }
});

router.post('/:id/cancel', async (req, res) => {
  const db = getDb();
  try {
    await db.transaction(async (client) => {
      const invRes = await client.query('SELECT id, payment_status, customer_id, total_amount, branch FROM invoices WHERE id = $1', [req.params.id]);
      const inv = invRes.rows[0];
      if (!inv || inv.payment_status === 'cancelled') return;
      
      const itemsRes = await client.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
      const items = itemsRes.rows;
      
      for (const item of items) {
        await client.query(`
          UPDATE products 
          SET stock_quantity = stock_quantity + $1,
              branch_stocks = jsonb_set(branch_stocks, ARRAY[$2], (COALESCE((branch_stocks->>$2)::numeric, 0) + $1)::text::jsonb)
          WHERE id = $3
        `, [item.quantity, inv.branch, item.product_id]);
        await client.query(`
          INSERT INTO stock_transactions (product_id, type, quantity, reference_id, notes, user_id)
          VALUES ($1, 'return', $2, $3, 'Cancelled Invoice', $4)
        `, [item.product_id, item.quantity, req.params.id, req.session.user.id]);
      }
      
      await client.query("UPDATE invoices SET payment_status = 'cancelled' WHERE id = $1", [req.params.id]);

      if (inv.customer_id && inv.payment_status === 'pending') {
        await client.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [inv.total_amount, inv.customer_id]);
      }
    });
    
    req.session.success = 'Invoice cancelled successfully!';
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to cancel invoice';
  }
  res.redirect(`/billing/${req.params.id}`);
});

router.post('/:id/delete', async (req, res) => {
  if (req.session.user.role !== 'admin') {
    req.session.error = 'Access Denied. Admins only.';
    return res.redirect('/billing');
  }

  const db = getDb();
  try {
    await db.transaction(async (client) => {
      const invRes = await client.query('SELECT id, payment_status, customer_id, total_amount, branch FROM invoices WHERE id = $1', [req.params.id]);
      const inv = invRes.rows[0];
      if (!inv) throw new Error('Invoice not found');

      // Only revert stock and balance if the invoice was not already cancelled
      if (inv.payment_status !== 'cancelled') {
        const itemsRes = await client.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
        const items = itemsRes.rows;
        
        for (const item of items) {
          await client.query(`
            UPDATE products 
            SET stock_quantity = stock_quantity + $1,
                branch_stocks = jsonb_set(branch_stocks, ARRAY[$2], (COALESCE((branch_stocks->>$2)::numeric, 0) + $1)::text::jsonb)
            WHERE id = $3
          `, [item.quantity, inv.branch, item.product_id]);
          // No need to insert a stock transaction if we are deleting the invoice entirely, but we could if we want a trace.
          // Since it's a hard delete, we will delete the existing 'sale' stock_transactions related to this invoice.
        }
        
        if (inv.customer_id && inv.payment_status === 'pending') {
          await client.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [inv.total_amount, inv.customer_id]);
        }
      }

      await client.query('DELETE FROM stock_transactions WHERE reference_id = $1 AND type = $2', [req.params.id, 'sale']);
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
      await client.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    });
    
    req.session.success = 'Invoice deleted entirely!';
    res.redirect('/billing');
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete invoice';
    res.redirect(`/billing/${req.params.id}`);
  }
});

module.exports = router;
