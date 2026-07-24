const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const categories = db.prepare(`
      SELECT c.*, COUNT(p.id) as product_count 
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      GROUP BY c.id
    `).all();
    res.render('categories/list', { pageTitle: 'Categories', activePage: 'categories', categories });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch categories', activePage: 'categories' });
  }
});

router.post('/add', (req, res) => {
  const { name, description } = req.body;
  try {
    getDb().prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(name, description);
    req.session.success = 'Category added successfully!';
  } catch (err) {
    req.session.error = 'Category name must be unique!';
  }
  res.redirect('/categories');
});

router.post('/edit/:id', (req, res) => {
  const { name, description } = req.body;
  try {
    getDb().prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?').run(name, description, req.params.id);
    req.session.success = 'Category updated successfully!';
  } catch (err) {
    req.session.error = 'Failed to update category';
  }
  res.redirect('/categories');
});

router.post('/delete/:id', (req, res) => {
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(id) as count FROM products WHERE category_id = ? AND is_active = 1').get(req.params.id).count;
    if (count > 0) {
      req.session.error = 'Cannot delete category containing products!';
    } else {
      db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
      req.session.success = 'Category deleted successfully!';
    }
  } catch (err) {
    req.session.error = 'Failed to delete category';
  }
  res.redirect('/categories');
});

module.exports = router;
