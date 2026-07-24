const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');

// 1. Ledger Dashboard
router.get('/ledger', (req, res) => {
  try {
    const db = getDb();
    
    // Fetch all customers with calculated balances
    const customers = db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
    
    const ledgerList = customers.map(cust => {
      // Sum of invoices (Debit)
      const invoiceSum = db.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) as total 
        FROM invoices 
        WHERE customer_id = ? AND payment_status != 'cancelled'
      `).get(cust.id).total;
      
      // Sum of payments (Credit)
      const paymentSum = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM payments 
        WHERE customer_id = ?
      `).get(cust.id).total;
      
      const netOutstanding = (cust.opening_balance || 0) + invoiceSum - paymentSum;
      
      return {
        id: cust.id,
        name: cust.name,
        phone: cust.phone,
        opening_balance: cust.opening_balance || 0,
        total_debit: invoiceSum,
        total_credit: paymentSum,
        balance: netOutstanding
      };
    });
    
    // Overall Stats
    const totalOutstanding = ledgerList.reduce((sum, item) => sum + item.balance, 0);
    const totalPaymentsReceived = ledgerList.reduce((sum, item) => sum + item.total_credit, 0);
    
    res.render('tally/ledger', { 
      pageTitle: 'Tally Ledgers', 
      activePage: 'tally',
      ledgers: ledgerList,
      totalOutstanding,
      totalPaymentsReceived,
      customers // Pass all customers for the receipt modal selection
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to load Tally Ledgers', activePage: 'tally' });
  }
});

// 2. Customer Ledger Details (Account Statement)
router.get('/ledger/:id', (req, res) => {
  const customerId = req.params.id;
  try {
    const db = getDb();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).render('error', { pageTitle: 'Not Found', message: 'Customer not found', activePage: 'tally' });
    }
    
    // Fetch Invoices (Debits)
    const invoices = db.prepare(`
      SELECT id, invoice_number as reference, total_amount as debit, 0.0 as credit, created_at as date, 'Invoice' as type, invoice_type
      FROM invoices 
      WHERE customer_id = ? AND payment_status != 'cancelled'
    `).all(customerId);
    
    // Fetch Payments (Credits)
    const payments = db.prepare(`
      SELECT id, 'PAY-REC-' || printf('%04d', id) as reference, 0.0 as debit, amount as credit, payment_date as date, 'Payment' as type, payment_method as invoice_type
      FROM payments 
      WHERE customer_id = ?
    `).all(customerId);
    
    // Combine and Sort Chronologically
    const transactions = [...invoices, ...payments].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Compute Running Balance
    let runningBalance = customer.opening_balance || 0;
    const ledgerEntries = transactions.map(tx => {
      runningBalance = runningBalance + tx.debit - tx.credit;
      return {
        ...tx,
        running_balance: runningBalance
      };
    });
    
    res.render('tally/statement', {
      pageTitle: `${customer.name} - Statement`,
      activePage: 'tally',
      customer,
      entries: ledgerEntries,
      closingBalance: runningBalance
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to generate statement', activePage: 'tally' });
  }
});

// 3. Log a Payment Receipt Voucher
router.post('/payment', (req, res) => {
  const { customer_id, amount, payment_date, payment_method, narration } = req.body;
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO payments (customer_id, amount, payment_date, payment_method, narration)
      VALUES (?, ?, ?, ?, ?)
    `).run(customer_id, amount, payment_date, payment_method, narration || '');
    
    res.redirect('/tally/ledger');
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { pageTitle: 'Error', message: 'Failed to record payment receipt', activePage: 'tally' });
  }
});

// 4. Export Page
router.get('/export', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.render('tally/export', { 
    pageTitle: 'Tally XML Export', 
    activePage: 'tally',
    today
  });
});

// 5. XML Generation for Tally Import
router.get('/export/xml', (req, res) => {
  const { from, to, sales_ledger = 'Sales Account', cgst_ledger = 'CGST Ledger', sgst_ledger = 'SGST Ledger' } = req.query;
  
  if (!from || !to) {
    return res.status(400).send('Please select a valid date range');
  }
  
  try {
    const db = getDb();
    
    // Fetch all invoices in date range
    const invoices = db.prepare(`
      SELECT i.*, c.name as customer_name 
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE date(i.created_at) >= ? AND date(i.created_at) <= ? AND i.payment_status != 'cancelled'
      ORDER BY i.created_at ASC
    `).all(from, to);
    
    let xml = `<?xml version="1.0"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Aimtech Solutions</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>\n`;
      
    invoices.forEach(inv => {
      // Fetch invoice items for ledger detail breakdown
      const items = db.prepare(`
        SELECT * FROM invoice_items WHERE invoice_id = ?
      `).all(inv.id);
      
      const dateStr = inv.created_at.split('T')[0].replace(/-/g, '');
      const partyName = inv.customer_name ? inv.customer_name.replace(/&/g, '&amp;') : 'Walk-in Customer';
      
      const totalAmount = inv.total_amount;
      const subtotal = inv.subtotal;
      const taxAmount = inv.tax_amount;
      const cgstVal = (taxAmount / 2).toFixed(2);
      const sgstVal = (taxAmount / 2).toFixed(2);
      
      xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="AccountingVoucherView">
            <DATE>${dateStr}</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${inv.invoice_number}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>
            <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>
            <NARRATION>${inv.notes ? inv.notes.replace(/&/g, '&amp;') : 'Sales invoice generated'}</NARRATION>
            
            <!-- Customer Debit Entry -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${partyName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${totalAmount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            
            <!-- Sales Account Credit Entry -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${sales_ledger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${subtotal.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>\n`;
            
      if (taxAmount > 0) {
        xml += `            <!-- CGST Credit Entry -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${cgst_ledger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${cgstVal}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            
            <!-- SGST Credit Entry -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${sgst_ledger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${sgstVal}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>\n`;
      }
      
      xml += `          </VOUCHER>
        </TALLYMESSAGE>\n`;
    });
    
    xml += `      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename=tally_sales_${from}_to_${to}.xml`);
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to generate Tally XML file');
  }
});

module.exports = router;
