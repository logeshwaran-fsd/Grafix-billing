const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');

router.get('/login', async (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { error: 'Please enter username and password' });
  }
  try {
    const dbRes = await getDb().query('SELECT * FROM users WHERE username = $1 AND is_active = 1', [username]);
    const user = dbRes.rows[0];
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name
      };
      return res.redirect('/dashboard');
    }
    res.render('login', { error: 'Invalid username or password' });
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'An error occurred during login' });
  }
});

router.get('/logout', async (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
