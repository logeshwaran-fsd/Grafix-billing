const express = require('express');
const router = express.Router();
const { getDb, updateSetting } = require('../database/db');
const { isAdmin } = require('../middleware/auth');

router.use(isAdmin);

router.get('/', async (req, res) => {
  res.render('settings', { pageTitle: 'Settings', activePage: 'settings' });
});

router.post('/', async (req, res) => {
  try {
    const keys = Object.keys(req.body);
    for (const key of keys) {
      await updateSetting(key, req.body[key]);
    }
    req.session.success = 'Settings updated successfully!';
  } catch (err) {
    req.session.error = 'Failed to update settings';
  }
  res.redirect('/settings');
});

module.exports = router;
