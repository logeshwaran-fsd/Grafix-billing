const { getAllSettings } = require('../database/db');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.status(403).render('error', { 
    pageTitle: 'Access Denied', 
    message: 'You do not have permission to access this page.',
    user: req.session.user,
    settings: getAllSettings(),
    activePage: ''
  });
}

function attachLocals(req, res, next) {
  res.locals.user = req.session.user || null;
  res.locals.settings = getAllSettings();
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  delete req.session.success;
  delete req.session.error;
  next();
}

module.exports = { isAuthenticated, isAdmin, attachLocals };
