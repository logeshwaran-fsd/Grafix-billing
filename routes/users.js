const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');
const { isAdmin } = require('../middleware/auth');

router.use(isAdmin);

router.get('/', async (req, res) => {
  try {
    const usersRes = await getDb().query('SELECT id, username, role, full_name, email, is_active FROM users');
    res.render('users/list', { pageTitle: 'User Management', activePage: 'users', users: usersRes.rows });
  } catch (err) {
    res.redirect('/dashboard');
  }
});

router.post('/add', async (req, res) => {
  const { username, password, full_name, role, email } = req.body;
  try {
    const hash = bcrypt.hashSync(password, 10);
    await getDb().query('INSERT INTO users (username, password_hash, role, full_name, email) VALUES ($1, $2, $3, $4, $5)', 
      [username, hash, role, full_name, email]);
    req.session.success = 'User added successfully!';
  } catch (err) {
    req.session.error = 'Failed to add user: Username must be unique';
  }
  res.redirect('/users');
});

router.post('/edit/:id', async (req, res) => {
  const { full_name, role, email, password } = req.body;
  try {
    const db = getDb();
    if (password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10);
      await db.query('UPDATE users SET full_name = $1, role = $2, email = $3, password_hash = $4 WHERE id = $5',
        [full_name, role, email, hash, req.params.id]);
    } else {
      await db.query('UPDATE users SET full_name = $1, role = $2, email = $3 WHERE id = $4',
        [full_name, role, email, req.params.id]);
    }
    req.session.success = 'User updated successfully!';
  } catch (err) {
    req.session.error = 'Failed to update user';
  }
  res.redirect('/users');
});

router.post('/toggle/:id', async (req, res) => {
  try {
    const db = getDb();
    const userRes = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    const user = userRes.rows[0];
    if (user && user.role === 'admin' && req.params.id == req.session.user.id) {
      req.session.error = 'Cannot deactivate yourself!';
    } else {
      await db.query('UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = $1', [req.params.id]);
      req.session.success = 'User status toggled successfully!';
    }
  } catch (err) {
    req.session.error = 'Failed to toggle user status';
  }
  res.redirect('/users');
});

module.exports = router;
