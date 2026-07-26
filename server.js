require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initialize } = require('./database/db');
const { isAuthenticated, isAdmin, attachLocals } = require('./middleware/auth');

const app = express();

initialize();

// Automatic Daily Backup (runs every 24 hours)
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR);
}
setInterval(() => {
  try {
    const dbPath = path.join(__dirname, 'database', 'inventory.db');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `inventory_backup_${timestamp}.db`);
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`[Backup] Automated backup created at ${backupPath}`);
    }
  } catch (err) {
    console.error('[Backup Error]', err);
  }
}, 24 * 60 * 60 * 1000); // 24 hours

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
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
