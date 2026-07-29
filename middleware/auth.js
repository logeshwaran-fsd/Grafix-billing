const { getAllSettings } = require('../database/db');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.includes('/api/')) {
    return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
  }
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  
  // Need async IIFE or promise handling since next/render inside
  getAllSettings().then(settings => {
    res.status(403).render('error', { 
      pageTitle: 'Access Denied', 
      message: 'You do not have permission to access this page.',
      user: req.session.user,
      settings: settings,
      activePage: ''
    });
  }).catch(next);
}

async function attachLocals(req, res, next) {
  res.locals.user = req.session.user || null;
  try {
    res.locals.settings = await getAllSettings();
  } catch (err) {
    res.locals.settings = {};
  }
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  delete req.session.success;
  delete req.session.error;
  next();
}

module.exports = { isAuthenticated, isAdmin, attachLocals };
