const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const dbRes = await getDb().query('SELECT * FROM branches ORDER BY name ASC');
    const branches = dbRes.rows;
    res.render('branches/list', { pageTitle: 'Branches', activePage: 'branches', branches });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to fetch branches', activePage: 'branches' });
  }
});

router.post('/add', async (req, res) => {
  const { name } = req.body;
  try {
    const db = getDb();
    await db.transaction(async (client) => {
       await client.query('INSERT INTO branches (name) VALUES ($1)', [name]);
       // Initialize branch stock for all existing products to 0
       await client.query(`UPDATE products SET branch_stocks = jsonb_set(branch_stocks, ARRAY[$1], '0'::jsonb, true)`, [name]);
    });
    req.session.success = 'Branch added successfully!';
  } catch (err) {
    req.session.error = 'Branch name must be unique!';
  }
  res.redirect('/branches');
});

router.post('/edit/:id', async (req, res) => {
  const { name } = req.body;
  const branchId = req.params.id;
  try {
    const db = getDb();
    await db.transaction(async (client) => {
      // Get old branch name
      const bRes = await client.query('SELECT name FROM branches WHERE id = $1', [branchId]);
      if (bRes.rows.length === 0) throw new Error('Branch not found');
      const oldName = bRes.rows[0].name;

      if (oldName !== name) {
        // 1. Update branches table
        await client.query('UPDATE branches SET name = $1 WHERE id = $2', [name, branchId]);

        // 2. Update invoices table
        await client.query('UPDATE invoices SET branch = $1 WHERE branch = $2', [name, oldName]);

        // 3. Update products JSONB branch_stocks
        await client.query(`
          UPDATE products
          SET branch_stocks = (branch_stocks - $1::text) || jsonb_build_object($2::text, COALESCE((branch_stocks->>$1)::numeric, 0))
          WHERE branch_stocks ? $1::text
        `, [oldName, name]);
      }
    });
    req.session.success = 'Branch updated successfully!';
  } catch (err) {
    req.session.error = 'Failed to update branch. Name must be unique.';
  }
  res.redirect('/branches');
});

router.post('/delete/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.transaction(async (client) => {
      const bRes = await client.query('SELECT name FROM branches WHERE id = $1', [req.params.id]);
      const branchName = bRes.rows[0].name;
      await client.query('DELETE FROM branches WHERE id = $1', [req.params.id]);
       // Remove branch stock from all products
      await client.query(`UPDATE products SET branch_stocks = branch_stocks - $1`, [branchName]);
    });
    req.session.success = 'Branch deleted successfully!';
  } catch (err) {
    req.session.error = 'Failed to delete branch';
  }
  res.redirect('/branches');
});

module.exports = router;
