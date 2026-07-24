let invoiceItems = [];

// Debounce for search
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const prodSearch = document.getElementById('product-search');
  const prodDropdown = document.getElementById('product-dropdown');

  if (prodSearch) {
    prodSearch.addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      if (q.length < 1) {
        prodDropdown.style.display = 'none';
        return;
      }
      const res = await fetch(`/products/api/search?q=${encodeURIComponent(q)}`);
      const products = await res.json();
      if (products.length > 0) {
        prodDropdown.innerHTML = products.map(p => `
          <div class="dropdown-item" onclick="addItem(${JSON.stringify(p).replace(/"/g, '&quot;')})">
            <span class="dropdown-item-code">${p.code}</span>
            <span class="dropdown-item-name">${p.name}</span>
            <span class="dropdown-item-price">₹${p.unit_price}</span>
            <span class="dropdown-item-stock">Stock: ${p.stock_quantity}</span>
          </div>
        `).join('');
        prodDropdown.style.display = 'block';
      } else {
        prodDropdown.innerHTML = '<div class="dropdown-item">No products found</div>';
        prodDropdown.style.display = 'block';
      }
    }, 250));
  }

  const custSearch = document.getElementById('customer-search');
  const custDropdown = document.getElementById('customer-dropdown');
  const custId = document.getElementById('customer-id');

  if (custSearch) {
    custSearch.addEventListener('input', debounce(async (e) => {
      const q = e.target.value.trim();
      if (q.length < 1) {
        custDropdown.style.display = 'none';
        custId.value = '';
        return;
      }
      const res = await fetch(`/customers/api/search?q=${encodeURIComponent(q)}`);
      const customers = await res.json();
      if (customers.length > 0) {
        custDropdown.innerHTML = customers.map(c => `
          <div class="dropdown-item" onclick="selectCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
            <span>${c.name}</span>
            <span>${c.phone || ''}</span>
          </div>
        `).join('');
        custDropdown.style.display = 'block';
      } else {
        custDropdown.style.display = 'none';
      }
    }, 250));
  }

  // Close dropdowns
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrapper')) {
      document.querySelectorAll('.autocomplete-dropdown').forEach(d => d.style.display = 'none');
    }
  });

  // Handle invoice cloning on load
  if (typeof CLONE_DATA !== 'undefined' && CLONE_DATA) {
    if (CLONE_DATA.customer_id) {
      document.getElementById('customer-id').value = CLONE_DATA.customer_id;
      document.getElementById('customer-search').value = CLONE_DATA.customer_name || 'Walk-in Customer';
    }
    document.getElementById('payment-method').value = CLONE_DATA.payment_method || 'cash';
    document.getElementById('payment-status').value = CLONE_DATA.payment_status || 'paid';
    document.getElementById('invoice-notes').value = CLONE_DATA.notes || '';
    document.getElementById('overall-discount').value = CLONE_DATA.discount || 0;
    document.getElementById('invoice-type').value = CLONE_DATA.invoice_type || 'gst';
    
    invoiceItems = CLONE_DATA.items;
    renderItems();
  }
});

function selectCustomer(id, name) {
  document.getElementById('customer-id').value = id;
  document.getElementById('customer-search').value = name;
  document.getElementById('customer-dropdown').style.display = 'none';
}

function addItem(p) {
  document.getElementById('product-search').value = '';
  document.getElementById('product-dropdown').style.display = 'none';

  const invoiceType = document.getElementById('invoice-type').value;
  const isEstimate = (invoiceType === 'estimate');

  const existing = invoiceItems.find(item => item.product_id === p.id);
  if (existing) {
    if (existing.quantity >= p.stock_quantity) {
      alert('Cannot add more than available stock!');
      return;
    }
    existing.quantity += 1;
  } else {
    invoiceItems.push({
      product_id: p.id,
      code: p.code,
      name: p.name,
      quantity: 1,
      unit_price: p.unit_price,
      discount: 0,
      original_tax_rate: p.gst_rate || 18,
      tax_rate: isEstimate ? 0 : (p.gst_rate || 18),
      stock_quantity: p.stock_quantity
    });
  }
  renderItems();
}

function onInvoiceTypeChange() {
  const type = document.getElementById('invoice-type').value;
  const isEstimate = (type === 'estimate');
  
  invoiceItems.forEach(item => {
    item.tax_rate = isEstimate ? 0 : (item.original_tax_rate || 18);
  });
  
  renderItems();
}

function renderItems() {
  const tbody = document.getElementById('invoice-items-body');
  if (invoiceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="table-empty">Search products to start billing</td></tr>';
    calculateTotals();
    return;
  }

  tbody.innerHTML = invoiceItems.map((item, index) => {
    const lineTotal = item.quantity * item.unit_price - item.discount;
    const gstAmt = lineTotal * (item.tax_rate / 100);
    const total = lineTotal + gstAmt;

    return `
      <tr>
        <td>${index + 1}</td>
        <td><span class="badge badge-default">${item.code}</span></td>
        <td class="fw-bold">${item.name}</td>
        <td>
          <input type="number" class="form-control" style="width: 70px; padding: 6px;" value="${item.quantity}" min="1" max="${item.stock_quantity}" onchange="updateQty(${index}, this.value)">
        </td>
        <td class="text-right">₹${item.unit_price.toFixed(2)}</td>
        <td>
          <input type="number" class="form-control" style="width: 80px; padding: 6px;" value="${item.discount}" min="0" onchange="updateDiscount(${index}, this.value)">
        </td>
        <td class="text-center">${item.tax_rate}%</td>
        <td class="text-right text-muted">₹${gstAmt.toFixed(2)}</td>
        <td class="text-right fw-bold">₹${total.toFixed(2)}</td>
        <td>
          <button type="button" class="btn btn-danger btn-sm" onclick="removeItem(${index})">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  calculateTotals();
}

function updateQty(index, val) {
  const qty = parseInt(val) || 1;
  const item = invoiceItems[index];
  if (qty > item.stock_quantity) {
    alert('Cannot exceed stock quantity!');
    item.quantity = item.stock_quantity;
  } else {
    item.quantity = qty;
  }
  renderItems();
}

function updateDiscount(index, val) {
  invoiceItems[index].discount = parseFloat(val) || 0;
  renderItems();
}

function removeItem(index) {
  invoiceItems.splice(index, 1);
  renderItems();
}

function calculateTotals() {
  let subtotal = 0;
  let tax = 0;
  let discount = parseFloat(document.getElementById('overall-discount').value) || 0;

  invoiceItems.forEach(item => {
    const lineTotal = item.quantity * item.unit_price;
    subtotal += lineTotal;
    discount += item.discount;
    tax += (lineTotal - item.discount) * (item.tax_rate / 100);
  });

  const grandTotal = subtotal - discount + tax;

  document.getElementById('subtotal-display').textContent = '₹' + subtotal.toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('tax-display').textContent = '₹' + tax.toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('discount-display').textContent = '₹' + discount.toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('grandtotal-display').textContent = '₹' + grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2});
}

async function submitInvoice() {
  if (invoiceItems.length === 0) {
    alert('Please add at least one product');
    return;
  }

  const data = {
    customer_id: document.getElementById('customer-id').value || null,
    payment_method: document.getElementById('payment-method').value,
    payment_status: document.getElementById('payment-status').value,
    notes: document.getElementById('invoice-notes').value,
    overall_discount: parseFloat(document.getElementById('overall-discount').value) || 0,
    invoice_type: document.getElementById('invoice-type').value,
    items: invoiceItems
  };

  const btn = document.getElementById('submit-invoice-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    const res = await fetch('/billing/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      window.location.href = '/billing/' + result.invoiceId;
    } else {
      alert(result.error || 'Failed to create invoice');
      btn.disabled = false;
      btn.textContent = 'Create Invoice & Print';
    }
  } catch (err) {
    alert('Error creating invoice');
    btn.disabled = false;
    btn.textContent = 'Create Invoice & Print';
  }
}