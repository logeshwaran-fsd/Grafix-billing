const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');
const { isAdmin } = require('../middleware/auth');

router.use(isAdmin);

router.get('/', (req, res) => {
  try {
    const users = getDb().prepare('SELECT id, username, role, full_name, email, is_active FROM users').all();
    res.render('users/list', { pageTitle: 'User Management', activePage: 'users', users });
  } catch (err) {
    res.redirect('/dashboard');
  }
});

router.post('/add', (req, res) => {
  const { username, password, full_name, role, email } = req.body;
  try {
    const hash = bcrypt.hashSync(password, 10);
    getDb().prepare('INSERT INTO users (username, password_hash, role, full_name, email) VALUES (?, ?, ?, ?, ?)')
      .run(username, hash, role, full_name, email);
    req.session.success = 'User added successfully!';
  } catch (err) {
    req.session.error = 'Failed to add user: Username must be unique';
  }
  res.redirect('/users');
});

router.post('/edit/:id', (req, res) => {
  const { full_name, role, email, password } = req.body;
  try {
    const db = getDb();
    if (password && password.trim() !== '') {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET full_name = ?, role = ?, email = ?, password_hash = ? WHERE id = ?')
        .run(full_name, role, email, hash, req.params.id);
    } else {
      db.prepare('UPDATE users SET full_name = ?, role = ?, email = ? WHERE id = ?')
        .run(full_name, role, email, req.params.id);
    }
    req.session.success = 'User updated successfully!';
  } catch (err) {
    req.session.error = 'Failed to update user';
  }
  res.redirect('/users');
});

router.post('/toggle/:id', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
    if (user && user.role === 'admin' && req.params.id == req.session.user.id) {
      req.session.error = 'Cannot deactivate yourself!';
    } else {
      db.prepare('UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
      req.session.success = 'User status toggled successfully!';
    }
  } catch (err) {
    req.session.error = 'Failed to toggle user status';
  }
  res.redirect('/users');
});

module.exports = router;
