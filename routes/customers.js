const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res) => {
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  try {
    let query = 'SELECT * FROM customers';
    const params = [];
    if (search) {
      query += ' WHERE name ILIKE $1 OR phone ILIKE $2 OR city ILIKE $3';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const countQuery = query.replace('*', 'COUNT(id) as count');
    const dbResCount = await getDb().query(countQuery, params);
    const totalCount = parseInt(dbResCount.rows[0].count, 10);
    const totalPages = Math.ceil(totalCount / limit);
    
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    query += ` ORDER BY name ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    params.push(limit, offset);
    
    const dbRes = await getDb().query(query, params);
    const customers = dbRes.rows;
    res.render('customers/list', { pageTitle: 'Customers', activePage: 'customers', customers, search, pagination: { page, totalPages } });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch customers', activePage: 'customers' });
  }
});

router.get('/api/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    const dbRes = await getDb().query(`
      SELECT id, name, phone, city, balance 
      FROM customers 
      WHERE name ILIKE $1 OR phone ILIKE $2 
      LIMIT 10
    `, [`${q}%`, `${q}%`]);
    res.json(dbRes.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

router.get('/add', async (req, res) => {
  res.render('customers/form', { pageTitle: 'Add Customer', activePage: 'customers', customer: null });
});

router.post('/add', async (req, res) => {
  const { name, phone, email, address, gstin, city, state, pincode } = req.body;
  try {
    await getDb().query(`
      INSERT INTO customers (name, phone, email, address, gstin, city, state, pincode) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [name, phone, email, address, gstin, city || 'Chennai', state || 'Tamil Nadu', pincode]);
    req.session.success = 'Customer added successfully!';
    res.redirect('/customers');
  } catch (err) {
    res.redirect('/customers/add');
  }
});

router.post('/api/quick-add', async (req, res) => {
  const { name, phone, city } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
  try {
    const dbRes = await getDb().query(`
      INSERT INTO customers (name, phone, city, state) 
      VALUES ($1, $2, $3, 'Tamil Nadu') RETURNING *
    `, [name, phone || '', city || 'Chennai']);
    const customer = dbRes.rows[0];
    res.json({ success: true, customer: { id: customer.id, name: customer.name, phone: customer.phone, city: customer.city } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add customer' });
  }
});

router.get('/edit/:id', async (req, res) => {
  try {
    const dbRes = await getDb().query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    const customer = dbRes.rows[0];
    if (!customer) return res.redirect('/customers');
    res.render('customers/form', { pageTitle: 'Edit Customer', activePage: 'customers', customer });
  } catch (err) {
    res.redirect('/customers');
  }
});

router.post('/edit/:id', async (req, res) => {
  const { name, phone, email, address, gstin, city, state, pincode } = req.body;
  try {
    await getDb().query(`
      UPDATE customers 
      SET name = $1, phone = $2, email = $3, address = $4, gstin = $5, city = $6, state = $7, pincode = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [name, phone, email, address, gstin, city, state, pincode, req.params.id]);
    req.session.success = 'Customer updated successfully!';
    res.redirect('/customers');
  } catch (err) {
    req.session.error = 'Failed to update customer';
    res.redirect(`/customers/edit/${req.params.id}`);
  }
});

router.post('/delete/:id', async (req, res) => {
  try {
    const dbResCount = await getDb().query('SELECT COUNT(id) as count FROM invoices WHERE customer_id = $1', [req.params.id]);
    const count = parseInt(dbResCount.rows[0].count, 10);
    if (count > 0) {
      req.session.error = 'Cannot delete customer with billing history!';
    } else {
      await getDb().query('DELETE FROM customers WHERE id = $1', [req.params.id]);
      req.session.success = 'Customer deleted successfully!';
    }
  } catch (err) {
    req.session.error = 'Failed to delete customer';
  }
  res.redirect('/customers');
});

router.post('/bulk-delete', async (req, res) => {
  let ids = req.body.customer_ids;
  if (!ids) return res.redirect('/customers');
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids); } catch(e) { ids = [ids]; }
  }
  if (!Array.isArray(ids)) ids = [ids];
  if (ids.length === 0) return res.redirect('/customers');
  try {
    const placeholders = ids.map((_, i) => '$' + (i + 1)).join(',');
    const result = await getDb().query(
      `DELETE FROM customers 
       WHERE id IN (${placeholders}) 
       AND id NOT IN (SELECT DISTINCT customer_id FROM invoices WHERE customer_id IS NOT NULL)`,
      ids
    );
    req.session.success = `${result.rowCount} customer(s) deleted successfully!`;
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete selected customers';
  }
  res.redirect('/customers');
});

router.post('/delete-all', async (req, res) => {
  try {
    const result = await getDb().query(
      `DELETE FROM customers 
       WHERE id NOT IN (SELECT DISTINCT customer_id FROM invoices WHERE customer_id IS NOT NULL)`
    );
    req.session.success = `All unused customers (${result.rowCount}) deleted successfully!`;
  } catch (err) {
    console.error(err);
    req.session.error = 'Failed to delete all customers';
  }
  res.redirect('/customers');
});

module.exports = router;
