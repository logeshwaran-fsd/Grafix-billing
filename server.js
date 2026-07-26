require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const fs = require('fs');
const { initialize, getDb } = require('./database/db');
const { isAuthenticated, isAdmin, attachLocals } = require('./middleware/auth');

const app = express();

initialize().catch(err => console.error("Database initialization failed:", err));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new pgSession({
    pool: getDb(),
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'default-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use('/', require('./routes/auth'));

app.use(isAuthenticated);
app.use(attachLocals);

app.use('/dashboard', require('./routes/dashboard'));
app.use('/products', require('./routes/products'));
app.use('/categories', require('./routes/categories'));
app.use('/customers', require('./routes/customers'));
app.use('/billing', require('./routes/billing'));
app.use('/inventory', require('./routes/inventory'));
app.use('/reports', isAdmin, require('./routes/reports'));
app.use('/users', isAdmin, require('./routes/users'));
app.use('/data', isAdmin, require('./routes/data'));
app.use('/settings', isAdmin, require('./routes/settings'));
app.use('/tally', isAdmin, require('./routes/tally'));
app.use('/credit', require('./routes/credit'));

app.get('/', (req, res) => res.redirect('/dashboard'));

app.use((req, res) => {
  res.status(404).render('error', { pageTitle: '404', message: 'Page not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { pageTitle: 'Error', message: err.message || 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ðŸš€ Grafix Impression - Inventory & Billing`);
  console.log(`  Server running at http://localhost:${PORT}`);
  console.log(`  Default login: admin / admin123\n`);
});
