const express = require('express');
const router = express.Router();
const { getDb, updateSetting } = require('../database/db');
const { isAdmin } = require('../middleware/auth');

router.use(isAdmin);

router.get('/', (req, res) => {
  res.render('settings', { pageTitle: 'Settings', activePage: 'settings' });
});

router.post('/', (req, res) => {
  try {
    Object.keys(req.body).forEach(key => {
      updateSetting(key, req.body[key]);
    });
    req.session.success = 'Settings updated successfully!';
  } catch (err) {
    req.session.error = 'Failed to update settings';
  }
  res.redirect('/settings');
});

module.exports = router;
