const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

// List all customers with outstanding balances
router.get('/', async (req, res) => {
  try {
    // Calculate total outstanding balance
    const resTotal = await getDb().query('SELECT SUM(balance) as total FROM customers WHERE balance > 0', []);
    const totalOutstandingRow = resTotal.rows[0];
    const totalOutstanding = totalOutstandingRow?.total || 0;

    // Get customers who have a balance > 0 or have had recent payments
    const resCust = await getDb().query(`
      SELECT * FROM customers 
      WHERE balance > 0 OR balance < 0 
      ORDER BY balance DESC
    `, []);
    const customers = resCust.rows;

    // Get recent payments
    const resPay = await getDb().query(`
      SELECT p.*, c.name as customer_name 
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      ORDER BY p.id DESC LIMIT 20
    `, []);
    const recentPayments = resPay.rows;

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
router.get('/:id', async (req, res) => {
  try {
    const resCust = await getDb().query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    const customer = resCust.rows[0];
    if (!customer) return res.redirect('/credit');

    // Get all invoices (debt)
    const resInv = await getDb().query("SELECT id, invoice_number as ref, created_at as date, 'Invoice' as type, total_amount as amount, payment_status as status FROM invoices WHERE customer_id = $1 AND payment_status != 'cancelled' ORDER BY created_at DESC", [customer.id]);
    const invoices = resInv.rows;
    
    // Get all payments (credit)
    const resPay = await getDb().query("SELECT id, narration as ref, payment_date as date, 'Payment' as type, amount, payment_method as status FROM payments WHERE customer_id = $1 ORDER BY payment_date DESC", [customer.id]);
    const payments = resPay.rows;

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
router.post('/receive', async (req, res) => {
  const { customer_id, amount, payment_method, payment_date, narration } = req.body;
  const payAmount = parseFloat(amount);
  
  if (!customer_id || payAmount <= 0) {
    req.session.error = 'Invalid payment amount or customer.';
    return res.redirect('/credit');
  }

  try {
    // 1. Insert payment record
    await getDb().query(`
      INSERT INTO payments (customer_id, amount, payment_date, payment_method, narration) 
      VALUES ($1, $2, $3, $4, $5)
    `, [customer_id, payAmount, payment_date || new Date().toISOString().split('T')[0], payment_method, narration]);
    
    // 2. Reduce customer balance
    await getDb().query(`
      UPDATE customers SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [payAmount, customer_id]);

    // Optional: We could also automatically mark oldest 'pending' invoices as 'paid' here.
    
    req.session.success = 'Payment received successfully!';
  } catch (err) {
    req.session.error = 'Failed to record payment.';
  }
  res.redirect('/credit');
});

module.exports = router;
