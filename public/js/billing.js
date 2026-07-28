let invoiceItems = [];

// Debounce for search
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function handleDropdownNav(e, dropdown, emptyCallback) {
  if (dropdown.style.display === 'none') {
    if (e.key === 'Enter' && emptyCallback) {
      e.preventDefault();
      emptyCallback();
    }
    return;
  }

  const items = Array.from(dropdown.querySelectorAll('.dropdown-item'));
  if (items.length === 0) return;

  let currentIndex = items.findIndex(item => item.classList.contains('active'));

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (currentIndex > -1) items[currentIndex].classList.remove('active');
    currentIndex = (currentIndex + 1) % items.length;
    items[currentIndex].classList.add('active');
    items[currentIndex].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentIndex > -1) items[currentIndex].classList.remove('active');
    currentIndex = currentIndex - 1 < 0 ? items.length - 1 : currentIndex - 1;
    items[currentIndex].classList.add('active');
    items[currentIndex].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentIndex > -1) {
      items[currentIndex].click();
    } else {
      items[0].click();
    }
  }
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
        prodDropdown.innerHTML = products.map(p => {
          let stocksText = '';
          if (p.branch_stocks) {
            stocksText = Object.entries(p.branch_stocks).map(([b, s]) => `${b} (${s})`).join(' | ');
          }
          return `
          <div class="dropdown-item" onclick="addItem(${JSON.stringify(p).replace(/"/g, '&quot;')})">
            <span class="dropdown-item-code">${p.code}</span>
            <span class="dropdown-item-name">${p.name}</span>
            <span class="dropdown-item-price">₹${p.unit_price}</span>
            <span class="dropdown-item-stock">Stock: ${stocksText}</span>
          </div>
        `}).join('');
        prodDropdown.style.display = 'block';
      } else {
        prodDropdown.innerHTML = '<div class="dropdown-item">No products found</div>';
        prodDropdown.style.display = 'block';
      }
    }, 250));

    prodSearch.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
        handleDropdownNav(e, prodDropdown, () => {
          if (prodSearch.value.trim() !== '') {
            // Open quick add product modal
            document.getElementById('quick-prod-name').value = prodSearch.value.trim();
            document.getElementById('quick-prod-code').value = '';
            document.getElementById('quick-prod-price').value = '0.00';
            document.getElementById('quick-prod-qty').value = '0';
            document.getElementById('quick-product-modal').style.display = 'flex';
            document.getElementById('quick-prod-code').focus();
          } else {
            document.getElementById('customer-search').focus();
          }
        });
      }
    });
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
          <div class="dropdown-item" onclick="selectCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.balance || 0})">
            <span>${c.name}</span>
            <span>${c.phone || ''}</span>
          </div>
        `).join('');
        custDropdown.style.display = 'block';
      } else {
        custDropdown.style.display = 'none';
      }
    }, 250));

    custSearch.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
        handleDropdownNav(e, custDropdown, () => {
          if (custSearch.value.trim() !== '') {
            // Open quick add customer modal
            document.getElementById('quick-cust-name').value = custSearch.value.trim();
            document.getElementById('quick-cust-phone').value = '';
            document.getElementById('quick-cust-city').value = 'Chennai';
            document.getElementById('quick-customer-modal').style.display = 'flex';
            document.getElementById('quick-cust-phone').focus();
          } else {
            document.getElementById('payment-method').focus();
          }
        });
      }
    });
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
    document.getElementById('invoice-type').value = CLONE_DATA.invoice_type || 'estimate';
    if (CLONE_DATA.branch) document.getElementById('branch-select').value = CLONE_DATA.branch;
    
    invoiceItems = CLONE_DATA.items;
    renderItems();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (document.activeElement.id === 'payment-method') {
        e.preventDefault();
        document.getElementById('payment-status').focus();
      } else if (document.activeElement.id === 'payment-status') {
        e.preventDefault();
        document.getElementById('invoice-notes').focus();
      } else if (document.activeElement.id === 'invoice-notes') {
        e.preventDefault();
        document.getElementById('submit-invoice-btn').focus();
      }
    }
  });
});

function selectCustomer(id, name, balance = 0) {
  document.getElementById('customer-id').value = id;
  document.getElementById('customer-search').value = name;
  document.getElementById('customer-dropdown').style.display = 'none';
  
  const walletSection = document.getElementById('wallet-section');
  const walletBalanceDisplay = document.getElementById('wallet-balance-display');
  const applyWalletCheckbox = document.getElementById('apply-wallet');
  const customerWalletBalance = document.getElementById('customer-wallet-balance');
  
  // Balance is negative if the customer has an advance (wallet)
  if (balance < 0) {
    const advance = Math.abs(balance);
    walletSection.style.display = 'block';
    walletBalanceDisplay.textContent = '₹' + advance.toFixed(2);
    customerWalletBalance.value = advance;
    applyWalletCheckbox.checked = false; // default to unchecked
  } else {
    walletSection.style.display = 'none';
    customerWalletBalance.value = 0;
    applyWalletCheckbox.checked = false;
  }
  
  calculateTotals();
  document.getElementById('payment-method').focus();
}

let pendingProductToAdd = null;

async function addItem(p) {
  document.getElementById('product-search').value = '';
  document.getElementById('product-dropdown').style.display = 'none';

  const selectedBranch = document.getElementById('branch-select').value;
  const branchStock = (p.branch_stocks && p.branch_stocks[selectedBranch]) ? parseInt(p.branch_stocks[selectedBranch]) : 0;

  if (branchStock <= 0) {
    pendingProductToAdd = p;
    document.getElementById('quick-stock-product-name').textContent = p.name;
    document.getElementById('quick-stock-product-id').value = p.id;
    document.getElementById('quick-stock-qty').value = 1;
    document.getElementById('quick-stock-modal').style.display = 'flex';
    document.getElementById('quick-stock-qty').focus();
    return;
  }

  try {
    const res = await fetch(`/products/api/history/${p.id}`);
    const history = await res.json();
    const histDiv = document.getElementById('product-history');
    if (history && history.length > 0) {
      const last = history[0];
      const dateStr = new Date(last.invoice_date).toLocaleDateString('en-IN');
      histDiv.innerHTML = `Last bought by <strong>${last.customer_name || 'Walk-in'}</strong> on ${dateStr} (Qty: ${last.quantity} @ ₹${last.unit_price})`;
      histDiv.style.display = 'block';
    } else {
      histDiv.style.display = 'none';
    }
  } catch(e) {}

  const invoiceType = document.getElementById('invoice-type').value;
  const isEstimate = (invoiceType === 'estimate');

  const existing = invoiceItems.find(item => item.product_id === p.id);
  if (existing) {
    if (existing.quantity >= branchStock) {
      alert('Cannot add more than available stock at ' + selectedBranch + ' branch!');
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
      original_unit_price: p.unit_price,
      discount: 0,
      original_tax_rate: p.gst_rate || 18,
      tax_rate: isEstimate ? 0 : (p.gst_rate || 18),
      stock_quantity: branchStock,
      total_stock: p.stock_quantity
    });
  }
  renderItems();

  setTimeout(() => {
    const qtyInputs = document.querySelectorAll('.qty-input');
    if (qtyInputs.length > 0) {
      qtyInputs[qtyInputs.length - 1].focus();
      qtyInputs[qtyInputs.length - 1].select();
    }
  }, 50);
}

function onInvoiceTypeChange() {
  const type = document.getElementById('invoice-type').value;
  const isEstimate = (type === 'estimate');
  
  invoiceItems.forEach(item => {
    item.tax_rate = isEstimate ? 0 : (item.original_tax_rate || 18);
  });
  
  renderItems();
}

function onBranchChange() {
  invoiceItems = [];
  renderItems();
  alert('Branch changed. All selected items have been cleared.');
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
        <td class="fw-bold">${item.name}</td>
        <td>
          <input type="number" class="form-control qty-input" style="width: 55px; padding: 4px;" value="${item.quantity}" min="1" max="${item.stock_quantity}" onchange="updateQty(${index}, this.value)" onkeydown="handleGridNav(event, 'qty', ${index})">
        </td>
        <td>
          <div style="position:relative; display:flex; align-items:center;">
            <span style="position:absolute; left:6px; color:var(--text-secondary); font-size:12px;">₹</span>
            <input type="number" class="form-control price-input" style="width: 75px; padding: 4px 4px 4px 16px;" value="${item.unit_price}" step="0.01" min="0" onchange="updatePrice(${index}, this.value)" onkeydown="handleGridNav(event, 'price', ${index})">
            ${item.unit_price !== item.original_unit_price ? `<button type="button" class="btn btn-sm" style="padding:1px 3px; margin-left:2px; background:none; color:var(--accent); border:none; cursor:pointer; font-size:10px;" onclick="resetPrice(${index})" title="Reset to Original Price (₹${item.original_unit_price})">↺</button>` : ''}
          </div>
        </td>
        <td>
          <input type="number" class="form-control discount-input" style="width: 60px; padding: 4px;" value="${item.discount}" min="0" onchange="updateDiscount(${index}, this.value)" onkeydown="handleGridNav(event, 'discount', ${index})">
        </td>
        <td class="text-right fw-bold">₹${total.toFixed(2)}</td>
        <td>
          <button type="button" class="btn btn-danger btn-sm" onclick="removeItem(${index})">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  calculateTotals();
}

function handleGridNav(e, type, index) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (type === 'qty') {
      const prices = document.querySelectorAll('.price-input');
      if (prices[index]) {
        prices[index].focus();
        prices[index].select();
      }
    } else if (type === 'price') {
      const discounts = document.querySelectorAll('.discount-input');
      if (discounts[index]) {
        discounts[index].focus();
        discounts[index].select();
      }
    } else if (type === 'discount') {
      document.getElementById('product-search').focus();
    }
  }
}

function updateQty(index, value) {
  const qty = parseInt(value);
  const item = invoiceItems[index];
  
  if (qty > 0 && qty <= item.stock_quantity) {
    item.quantity = qty;
    renderItems();
  } else if (qty > item.stock_quantity) {
    pendingProductToAdd = { ...item, id: item.product_id, targetQty: qty, updateIndex: index };
    document.getElementById('quick-stock-product-name').textContent = item.name;
    document.getElementById('quick-stock-product-id').value = item.product_id;
    document.getElementById('quick-stock-qty').value = qty - item.stock_quantity;
    document.getElementById('quick-stock-modal').style.display = 'flex';
    document.getElementById('quick-stock-qty').focus();
    
    // Re-render to reset the visual input box back to the old valid quantity until stock is approved
    renderItems();
  } else {
    alert('Invalid quantity!');
    renderItems();
  }
}

function updatePrice(index, value) {
  const price = parseFloat(value);
  if (price >= 0) {
    invoiceItems[index].unit_price = price;
    renderItems();
  } else {
    alert('Invalid price!');
    renderItems();
  }
}

function resetPrice(index) {
  invoiceItems[index].unit_price = invoiceItems[index].original_unit_price;
  renderItems();
}

function updateDiscount(index, value) {
  invoiceItems[index].discount = parseFloat(value) || 0;
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
  let netPayable = grandTotal;
  
  const applyWallet = document.getElementById('apply-wallet');
  const walletDeductionRow = document.getElementById('wallet-deduction-row');
  const walletDeductionDisplay = document.getElementById('wallet-deduction-display');
  const customerWalletBalance = parseFloat(document.getElementById('customer-wallet-balance').value) || 0;
  
  let walletAppliedAmount = 0;
  if (applyWallet && applyWallet.checked && customerWalletBalance > 0) {
    walletAppliedAmount = Math.min(grandTotal, customerWalletBalance);
    netPayable = grandTotal - walletAppliedAmount;
    walletDeductionRow.style.setProperty('display', 'flex', 'important');
    walletDeductionDisplay.textContent = '- ₹' + walletAppliedAmount.toLocaleString('en-IN', {minimumFractionDigits: 2});
  } else if (walletDeductionRow) {
    walletDeductionRow.style.setProperty('display', 'none', 'important');
    walletAppliedAmount = 0;
  }

  document.getElementById('subtotal-display').textContent = '₹' + subtotal.toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('discount-display').textContent = '₹' + discount.toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('grandtotal-display').textContent = '₹' + grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2});
  
  const netPayableDisplay = document.getElementById('netpayable-display');
  if(netPayableDisplay) {
    netPayableDisplay.textContent = '₹' + netPayable.toLocaleString('en-IN', {minimumFractionDigits: 2});
  }
  
  // Set default Amount Paid to Net Payable if it's currently 0 or matches previous net payable
  const amtPaidInput = document.getElementById('amount-paid');
  if (amtPaidInput && (parseFloat(amtPaidInput.value) === 0 || !amtPaidInput.dataset.manuallyEdited)) {
    amtPaidInput.value = netPayable.toFixed(2);
  }
  
  updateChangeDisplay();
}

function updateChangeDisplay() {
  const netPayableText = document.getElementById('netpayable-display');
  if (!netPayableText) return;
  const netPayable = parseFloat(netPayableText.textContent.replace('₹', '').replace(/,/g, '')) || 0;
  const amtPaid = parseFloat(document.getElementById('amount-paid').value) || 0;
  
  const changeDisplay = document.getElementById('change-display');
  
  if (amtPaid > netPayable) {
    const change = amtPaid - netPayable;
    changeDisplay.style.display = 'block';
    changeDisplay.textContent = 'Change to Return / Add to Wallet: ₹' + change.toLocaleString('en-IN', {minimumFractionDigits: 2});
    changeDisplay.style.color = 'var(--success)';
  } else if (amtPaid < netPayable) {
    const dues = netPayable - amtPaid;
    changeDisplay.style.display = 'block';
    changeDisplay.textContent = 'Pending Dues (Credit): ₹' + dues.toLocaleString('en-IN', {minimumFractionDigits: 2});
    changeDisplay.style.color = 'var(--danger)';
  } else {
    changeDisplay.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const amtPaidInput = document.getElementById('amount-paid');
  if (amtPaidInput) {
    amtPaidInput.addEventListener('input', () => {
      amtPaidInput.dataset.manuallyEdited = 'true';
      updateChangeDisplay();
    });
  }
});

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
    branch: document.getElementById('branch-select').value,
    amount_paid: parseFloat(document.getElementById('amount-paid').value) || 0,
    apply_wallet: document.getElementById('apply-wallet') ? document.getElementById('apply-wallet').checked : false,
    items: invoiceItems
  };

  const btn = document.getElementById('submit-invoice-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  const isEditing = typeof EDIT_INVOICE_ID !== 'undefined' && EDIT_INVOICE_ID;
  const url = isEditing ? `/billing/${EDIT_INVOICE_ID}/edit` : '/billing/create';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success) {
      // Open the print view in a new tab/window so we don't leave the billing screen
      window.open('/billing/' + (isEditing ? EDIT_INVOICE_ID : result.invoiceId) + '?print=true', '_blank');
      
      // Reload the page to clear the form and start a new bill immediately
      if (!isEditing) {
        window.location.reload();
      } else {
        window.location.href = '/billing';
      }
    } else {
      alert(result.error || (isEditing ? 'Failed to update invoice' : 'Failed to create invoice'));
      btn.disabled = false;
      btn.textContent = isEditing ? 'Update Invoice & Print' : 'Create Invoice & Print';
    }
  } catch (err) {
    alert(isEditing ? 'Error updating invoice' : 'Error creating invoice');
    btn.disabled = false;
    btn.textContent = isEditing ? 'Update Invoice & Print' : 'Create Invoice & Print';
  }
}

function closeQuickStockModal() {
  document.getElementById('quick-stock-modal').style.display = 'none';
  pendingProductToAdd = null;
  document.getElementById('product-search').focus();
}

async function submitQuickStock() {
  const qtyInput = document.getElementById('quick-stock-qty');
  const qty = parseInt(qtyInput.value);
  if (!qty || qty <= 0) return alert('Invalid quantity');
  
  try {
    const res = await fetch(`/inventory/api/adjust/${pendingProductToAdd.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'purchase',
        quantity: qty,
        notes: 'Quick adjust during billing'
      })
    });
    const result = await res.json();
    if (result.success) {
      if (pendingProductToAdd.updateIndex !== undefined) {
        const idx = pendingProductToAdd.updateIndex;
        invoiceItems[idx].stock_quantity = result.newStock;
        invoiceItems[idx].quantity = pendingProductToAdd.targetQty <= result.newStock ? pendingProductToAdd.targetQty : result.newStock;
        closeQuickStockModal();
        renderItems();
      } else {
        pendingProductToAdd.stock_quantity = result.newStock;
        const p = pendingProductToAdd;
        closeQuickStockModal();
        addItem(p);
      }
    } else {
      alert(result.error || 'Failed to update stock');
    }
  } catch(err) {
    alert('Error updating stock');
  }
}

function openQuickCustModal() {
  document.getElementById('quick-cust-name').value = document.getElementById('customer-search').value.trim();
  document.getElementById('quick-cust-phone').value = '';
  document.getElementById('quick-cust-city').value = 'Chennai';
  document.getElementById('quick-customer-modal').style.display = 'flex';
  document.getElementById('quick-cust-phone').focus();
}

function closeQuickCustModal() {
  document.getElementById('quick-customer-modal').style.display = 'none';
  document.getElementById('customer-search').focus();
}

async function submitQuickCust() {
  const name = document.getElementById('quick-cust-name').value.trim();
  const phone = document.getElementById('quick-cust-phone').value.trim();
  const city = document.getElementById('quick-cust-city').value.trim();
  
  if (!name) return alert('Customer Name is required!');
  
  try {
    const res = await fetch('/customers/api/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, city })
    });
    const result = await res.json();
    if (result.success) {
      closeQuickCustModal();
      selectCustomer(result.customer.id, result.customer.name);
    } else {
      alert(result.error || 'Failed to add customer');
    }
  } catch(err) {
    alert('Error saving customer');
  }
}

function openQuickProdModal() {
  document.getElementById('quick-prod-name').value = document.getElementById('product-search').value.trim();
  document.getElementById('quick-prod-code').value = '';
  document.getElementById('quick-prod-price').value = '0.00';
  document.getElementById('quick-prod-qty').value = '0';
  document.getElementById('quick-product-modal').style.display = 'flex';
  document.getElementById('quick-prod-code').focus();
}

function closeQuickProdModal() {
  document.getElementById('quick-product-modal').style.display = 'none';
  document.getElementById('product-search').focus();
}

async function submitQuickProd() {
  const code = document.getElementById('quick-prod-code').value.trim();
  const name = document.getElementById('quick-prod-name').value.trim();
  const price = document.getElementById('quick-prod-price').value;
  const qty = document.getElementById('quick-prod-qty').value;
  const gst = document.getElementById('quick-prod-gst').value;
  
  if (!code || !name) return alert('Code and Name are required!');
  
  try {
    const res = await fetch('/products/api/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code, name,
        unit_price: parseFloat(price) || 0,
        cost_price: parseFloat(price) || 0,
        stock_quantity: parseInt(qty) || 0,
        gst_rate: parseFloat(gst) || 18
      })
    });
    const result = await res.json();
    if (result.success) {
      closeQuickProdModal();
      addItem(result.product);
    } else {
      alert(result.error || 'Failed to add product');
    }
  } catch(err) {
    alert('Error saving product');
  }
}