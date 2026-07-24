const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  try {
    const db = getDb();
    let query = 'SELECT * FROM customers';
    const params = [];
    if (search) {
      query += ' WHERE name LIKE ? OR phone LIKE ? OR city LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const countQuery = query.replace('*', 'COUNT(id) as count');
    const totalCount = db.prepare(countQuery).get(...params).count;
    const totalPages = Math.ceil(totalCount / limit);
    query += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const customers = db.prepare(query).all(...params);
    res.render('customers/list', { pageTitle: 'Customers', activePage: 'customers', customers, search, pagination: { page, totalPages } });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch customers', activePage: 'customers' });
  }
});

router.get('/api/search', (req, res) => {
  const q = req.query.q || '';
  try {
    const db = getDb();
    const customers = db.prepare(`
      SELECT id, name, phone, city 
      FROM customers 
      WHERE name LIKE ? OR phone LIKE ? 
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`);
    res.json(customers);
  } catch (err) {
    res.status(500).json([]);
  }
});

router.get('/add', (req, res) => {
  res.render('customers/form', { pageTitle: 'Add Customer', activePage: 'customers', customer: null });
});

router.post('/add', (req, res) => {
  const { name, phone, email, address, gstin, city, state, pincode } = req.body;
  try {
    getDb().prepare(`
      INSERT INTO customers (name, phone, email, address, gstin, city, state, pincode) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, phone, email, address, gstin, city || 'Chennai', state || 'Tamil Nadu', pincode);
    req.session.success = 'Customer added successfully!';
    res.redirect('/customers');
  } catch (err) {
    req.session.error = 'Failed to add customer';
    res.redirect('/customers/add');
  }
});

router.get('/edit/:id', (req, res) => {
  try {
    const customer = getDb().prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.redirect('/customers');
    res.render('customers/form', { pageTitle: 'Edit Customer', activePage: 'customers', customer });
  } catch (err) {
    res.redirect('/customers');
  }
});

router.post('/edit/:id', (req, res) => {
  const { name, phone, email, address, gstin, city, state, pincode } = req.body;
  try {
    getDb().prepare(`
      UPDATE customers 
      SET name = ?, phone = ?, email = ?, address = ?, gstin = ?, city = ?, state = ?, pincode = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, phone, email, address, gstin, city, state, pincode, req.params.id);
    req.session.success = 'Customer updated successfully!';
    res.redirect('/customers');
  } catch (err) {
    req.session.error = 'Failed to update customer';
    res.redirect(`/customers/edit/${req.params.id}`);
  }
});

router.post('/delete/:id', (req, res) => {
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(id) as count FROM invoices WHERE customer_id = ?').get(req.params.id).count;
    if (count > 0) {
      req.session.error = 'Cannot delete customer with billing history!';
    } else {
      db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
      req.session.success = 'Customer deleted successfully!';
    }
  } catch (err) {
    req.session.error = 'Failed to delete customer';
  }
  res.redirect('/customers');
});

module.exports = router;
