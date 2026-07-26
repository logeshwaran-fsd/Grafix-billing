const fs = require('fs');
const PDFParser = require("pdf2json");
const { getDb, initialize } = require('C:\\Users\\acer\\Downloads\\inventory-billing-app\\database\\db');

initialize();
const db = getDb();

function processCustomerText(text) {
  const lines = text.split('\n').map(l => l.trim().replace(/\r/g, '')).filter(l => l);
  let currentCustomer = null;
  let customersImported = 0;
  
  const insertCustomerStmt = db.prepare(`
    INSERT OR IGNORE INTO customers (name, phone, address, email)
    VALUES (?, ?, ?, ?)
  `);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Name & Address') || line.includes('Page ') || line.includes('Address Book')) continue;
    if (line.includes('E-Mail ID.')) continue;
    
    const phoneMatch = line.match(/\b\d{10,11}\b/);
    const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    
    if (!phoneMatch && !emailMatch && line.length > 2 && line === line.toUpperCase()) {
      if (currentCustomer && currentCustomer.name) {
        insertCustomerStmt.run(currentCustomer.name, currentCustomer.phone || '', currentCustomer.address || '', currentCustomer.email || '');
        customersImported++;
      }
      currentCustomer = { name: line, address: '', phone: '', email: '' };
    } else if (currentCustomer) {
      if (phoneMatch && !currentCustomer.phone) currentCustomer.phone = phoneMatch[0];
      if (emailMatch && !currentCustomer.email) currentCustomer.email = emailMatch[0];
      if (!phoneMatch && !emailMatch) {
          currentCustomer.address += (currentCustomer.address ? ', ' : '') + line;
      }
    }
  }
  if (currentCustomer && currentCustomer.name) {
     insertCustomerStmt.run(currentCustomer.name, currentCustomer.phone || '', currentCustomer.address || '', currentCustomer.email || '');
     customersImported++;
  }
  console.log(`Imported ${customersImported} customers.`);
}

function processProductText(text) {
  const lines = text.split('\n').map(l => l.trim().replace(/\r/g, '')).filter(l => l);
  let productsImported = 0;
  const insertProductStmt = db.prepare(`
    INSERT OR REPLACE INTO products (code, name, stock_quantity, cost_price, unit_price, reorder_level, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  for (let i = 0; i < lines.length; i++) {
     const line = lines[i];
     // Match pattern: "001 Polymer Plate 2.84 KODAK ORG 20 0.00 290.00 10 High"
     // The raw text might have tabs or weird spacing.
     // Also match without status if status is missing
     const match = line.match(/^([0-9a-zA-Z-]+)\s+(.+?)\s+([0-9,]+)\s+([0-9.,]+)\s+([0-9.,]+)\s+([0-9]+)(\s+(High|Low|Normal))?$/i);
     if (match) {
       let code = match[1];
       let name = match[2];
       let qty = parseInt(match[3].replace(/,/g, '')) || 0;
       let cost = parseFloat(match[4].replace(/,/g, '')) || 0;
       let price = parseFloat(match[5].replace(/,/g, '')) || 0;
       let reorder = parseInt(match[6]) || 0;
       
       insertProductStmt.run(code, name, qty, cost, price, reorder);
       productsImported++;
     }
  }
  console.log(`Imported ${productsImported} products.`);
}

// 1. Customers
const customerPdfPath = 'C:\\Users\\acer\\.gemini\\antigravity\\brain\\11dcf9f6-b8ef-4ff0-bc0f-e26e551b1674\\.user_uploaded\\media__1785040762743.pdf';
if (fs.existsSync(customerPdfPath)) {
  const pdfParser = new PDFParser(this, 1);
  pdfParser.on("pdfParser_dataError", errData => console.error(errData.parserError));
  pdfParser.on("pdfParser_dataReady", pdfData => {
      console.log('Customer PDF Parsed.');
      processCustomerText(pdfParser.getRawTextContent());
      
      // 2. Products
      const productPdfPath = 'C:\\Users\\acer\\.gemini\\antigravity\\brain\\11dcf9f6-b8ef-4ff0-bc0f-e26e551b1674\\.user_uploaded\\media__1785040762792.pdf';
      if (fs.existsSync(productPdfPath)) {
        const p2 = new PDFParser(this, 1);
        p2.on("pdfParser_dataError", errData => console.error(errData.parserError));
        p2.on("pdfParser_dataReady", pdfData => {
            console.log('Product PDF Parsed.');
            processProductText(p2.getRawTextContent());
        });
        p2.loadPDF(productPdfPath);
      }
  });
  pdfParser.loadPDF(customerPdfPath);
}
