const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const dbRes = await getDb().query(`
      SELECT c.*, COUNT(p.id) as product_count, STRING_AGG(p.name, ', ') as product_names 
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      GROUP BY c.id
    `, []);
    const categories = dbRes.rows;
    res.render('categories/list', { pageTitle: 'Brands', activePage: 'categories', categories });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch categories', activePage: 'categories' });
  }
});

router.post('/add', async (req, res) => {
  const { name, description } = req.body;
  try {
    await getDb().query('INSERT INTO categories (name, description) VALUES ($1, $2)', [name, description]);
    req.session.success = 'Brand added successfully!';
  } catch (err) {
    req.session.error = 'Brand name must be unique!';
  }
  res.redirect('/categories');
});

router.post('/edit/:id', async (req, res) => {
  const { name, description } = req.body;
  try {
    await getDb().query('UPDATE categories SET name = $1, description = $2 WHERE id = $3', [name, description, req.params.id]);
    req.session.success = 'Brand updated successfully!';
  } catch (err) {
    req.session.error = 'Failed to update brand';
  }
  res.redirect('/categories');
});

router.post('/delete/:id', async (req, res) => {
  try {
    const dbRes = await getDb().query('SELECT COUNT(id) as count FROM products WHERE category_id = $1 AND is_active = 1', [req.params.id]);
    const count = parseInt(dbRes.rows[0].count, 10);
    if (count > 0) {
      req.session.error = 'Cannot delete brand containing products!';
    } else {
      await getDb().query('DELETE FROM categories WHERE id = $1', [req.params.id]);
      req.session.success = 'Brand deleted successfully!';
    }
  } catch (err) {
    req.session.error = 'Failed to delete brand';
  }
  res.redirect('/categories');
});

module.exports = router;
