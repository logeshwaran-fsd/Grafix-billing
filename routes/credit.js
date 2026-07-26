const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

// List all customers with outstanding balances
router.get('/', (req, res) => {
  try {
    const db = getDb();
    
    // Calculate total outstanding balance
    const totalOutstandingRow = db.prepare('SELECT SUM(balance) as total FROM customers WHERE balance > 0').get();
    const totalOutstanding = totalOutstandingRow?.total || 0;

    // Get customers who have a balance > 0 or have had recent payments
    const customers = db.prepare(`
      SELECT * FROM customers 
      WHERE balance > 0 OR balance < 0 
      ORDER BY balance DESC
    `).all();

    // Get recent payments
    const recentPayments = db.prepare(`
      SELECT p.*, c.name as customer_name 
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      ORDER BY p.id DESC LIMIT 20
    `).all();

    res.render('customers/credit', { 
      pageTitle: 'Credit Management', 
      activePage: 'credit', 
      customers,
      recentPayments,
      totalOutstanding
    });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to load credit dashboard', activePage: 'credit' });
  }
});

// View single customer statement / ledger
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.redirect('/credit');

    // Get all invoices (debt)
    const invoices = db.prepare("SELECT id, invoice_number as ref, created_at as date, 'Invoice' as type, total_amount as amount, payment_status as status FROM invoices WHERE customer_id = ? AND payment_status != 'cancelled' ORDER BY created_at DESC").all(customer.id);
    
    // Get all payments (credit)
    const payments = db.prepare("SELECT id, narration as ref, payment_date as date, 'Payment' as type, amount, payment_method as status FROM payments WHERE customer_id = ? ORDER BY payment_date DESC").all(customer.id);

    // Combine and sort
    const ledger = [...invoices, ...payments].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.render('customers/statement', { 
      pageTitle: 'Customer Statement', 
      activePage: 'credit', 
      customer,
      ledger
    });
  } catch (err) {
    res.redirect('/credit');
  }
});

// Log a payment received
router.post('/receive', (req, res) => {
  const { customer_id, amount, payment_method, payment_date, narration } = req.body;
  const payAmount = parseFloat(amount);
  
  if (!customer_id || payAmount <= 0) {
    req.session.error = 'Invalid payment amount or customer.';
    return res.redirect('/credit');
  }

  try {
    const db = getDb();
    
    db.transaction(() => {
      // 1. Insert payment record
      db.prepare(`
        INSERT INTO payments (customer_id, amount, payment_date, payment_method, narration) 
        VALUES (?, ?, ?, ?, ?)
      `).run(customer_id, payAmount, payment_date || new Date().toISOString().split('T')[0], payment_method, narration);
      
      // 2. Reduce customer balance
      db.prepare(`
        UPDATE customers SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(payAmount, customer_id);

      // Optional: We could also automatically mark oldest 'pending' invoices as 'paid' here.
    })();
    
    req.session.success = 'Payment received successfully!';
  } catch (err) {
    req.session.error = 'Failed to record payment.';
  }
  res.redirect('/credit');
});

module.exports = router;
