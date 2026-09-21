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
        return;
      }
      const res = await fetch(`/customers/api/search?q=${encodeURIComponent(q)}`);
      const customers = await res.json();
      if (customers.length > 0) {
        custDropdown.innerHTML = customers.map(c => {
          const addressParts = [c.address, c.city, c.pincode].filter(Boolean).join(', ');
          const gstinBadge = c.gstin ? `<span class="badge badge-default" style="font-size:10px; margin-left:6px; background:#334155; color:#fff;">GST: ${c.gstin}</span>` : '';
          return `
          <div class="dropdown-item customer-search-item" onclick="selectCustomer(${JSON.stringify(c).replace(/"/g, '&quot;')})" style="padding:10px 14px; border-bottom:1px solid var(--border); cursor:pointer; text-align:left; display:block;">
            <div style="font-weight:700; color:var(--text-primary); font-size:14px; line-height:1.3;">
              ${c.name} ${gstinBadge}
            </div>
            ${addressParts ? `<div style="font-size:12px; color:var(--text-secondary); margin-top:3px; line-height:1.35; word-break:break-word;">${addressParts}</div>` : ''}
            ${c.phone ? `<div style="font-size:12px; font-weight:700; color:var(--accent); margin-top:3px;">Phone: ${c.phone}</div>` : ''}
          </div>
        `}).join('');
        custDropdown.style.display = 'block';
      } else {
        custDropdown.innerHTML = '<div class="dropdown-item" style="padding:12px 14px; color:var(--text-secondary); text-align:center;">No existing customer found. Click "+" to add new.</div>';
        custDropdown.style.display = 'block';
      }
    }, 250));

    custSearch.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
        handleDropdownNav(e, custDropdown, () => {
          if (custSearch.value.trim() !== '') {
            // Open quick add customer modal with prefilled name
            openQuickCustModal();
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

  // Handle invoice cloning / edit on load
  if (typeof CLONE_DATA !== 'undefined' && CLONE_DATA) {
    if (CLONE_DATA.customer) {
      selectCustomer(CLONE_DATA.customer);
    } else if (CLONE_DATA.customer_id) {
      selectCustomer({
        id: CLONE_DATA.customer_id,
        name: CLONE_DATA.customer_name || 'Walk-in Customer',
        balance: 0
      });
    }
    document.getElementById('payment-method').value = CLONE_DATA.payment_method || 'cash';
    document.getElementById('payment-status').value = CLONE_DATA.payment_status || 'paid';
    if (document.getElementById('courier-charges')) {
      document.getElementById('courier-charges').value = CLONE_DATA.courier_charges || 0;
    }
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
        const cc = document.getElementById('courier-charges');
        if (cc) cc.focus();
        else document.getElementById('submit-invoice-btn').focus();
      } else if (document.activeElement.id === 'courier-charges') {
        e.preventDefault();
        document.getElementById('submit-invoice-btn').focus();
      }
    }
  });
});

function selectCustomer(custOrId, nameFallback, balanceFallback = 0) {
  let cust = null;
  if (typeof custOrId === 'object' && custOrId !== null) {
    cust = custOrId;
  } else {
    cust = {
      id: custOrId,
      name: nameFallback,
      balance: balanceFallback
    };
  }

  document.getElementById('customer-id').value = cust.id || '';
  document.getElementById('customer-search').value = cust.name || '';
  const custDropdown = document.getElementById('customer-dropdown');
  if (custDropdown) custDropdown.style.display = 'none';

  // Populate Selected Customer Card
  const card = document.getElementById('selected-customer-card');
  const cardName = document.getElementById('card-cust-name');
  const cardPhone = document.getElementById('card-cust-phone');
  const cardAddress = document.getElementById('card-cust-address');
  const cardGstin = document.getElementById('card-cust-gstin-badge');

  if (card && cust.id) {
    if (cardName) cardName.textContent = cust.name || 'Walk-in Customer';
    if (cardPhone) cardPhone.textContent = 'Phone: ' + (cust.phone || '-');
    
    const addressFull = [cust.address, cust.city, cust.state, cust.pincode].filter(Boolean).join(', ');
    if (cardAddress) cardAddress.textContent = 'Address: ' + (addressFull || '-');
    
    if (cardGstin) {
      if (cust.gstin) {
        cardGstin.textContent = 'GST: ' + cust.gstin;
        cardGstin.style.display = 'inline-block';
      } else {
        cardGstin.style.display = 'none';
      }
    }
    card.style.display = 'block';
  } else if (card) {
    card.style.display = 'none';
  }

  // Populate Outstanding Dues & Wallet Sections
  const outstandingSection = document.getElementById('outstanding-section');
  const outstandingBalanceDisplay = document.getElementById('outstanding-balance-display');
  const includeOutstandingCheckbox = document.getElementById('include-outstanding');
  const customerOutstandingBalance = document.getElementById('customer-outstanding-balance');

  const walletSection = document.getElementById('wallet-section');
  const walletBalanceDisplay = document.getElementById('wallet-balance-display');
  const applyWalletCheckbox = document.getElementById('apply-wallet');
  const customerWalletBalance = document.getElementById('customer-wallet-balance');
  
  const balance = parseFloat(cust.balance) || 0;
  if (balance > 0) {
    // Customer has pending outstanding debt
    if (outstandingSection) outstandingSection.style.display = 'block';
    if (outstandingBalanceDisplay) outstandingBalanceDisplay.textContent = '₹' + balance.toFixed(2);
    if (customerOutstandingBalance) customerOutstandingBalance.value = balance;
    if (includeOutstandingCheckbox) includeOutstandingCheckbox.checked = true;

    if (walletSection) walletSection.style.display = 'none';
    if (customerWalletBalance) customerWalletBalance.value = 0;
    if (applyWalletCheckbox) applyWalletCheckbox.checked = false;
  } else if (balance < 0) {
    // Customer has overpaid advance (wallet)
    const advance = Math.abs(balance);
    if (walletSection) walletSection.style.display = 'block';
    if (walletBalanceDisplay) walletBalanceDisplay.textContent = '₹' + advance.toFixed(2);
    if (customerWalletBalance) customerWalletBalance.value = advance;
    if (applyWalletCheckbox) applyWalletCheckbox.checked = true;

    if (outstandingSection) outstandingSection.style.display = 'none';
    if (customerOutstandingBalance) customerOutstandingBalance.value = 0;
    if (includeOutstandingCheckbox) includeOutstandingCheckbox.checked = false;
  } else {
    if (outstandingSection) outstandingSection.style.display = 'none';
    if (customerOutstandingBalance) customerOutstandingBalance.value = 0;
    if (includeOutstandingCheckbox) includeOutstandingCheckbox.checked = false;

    if (walletSection) walletSection.style.display = 'none';
    if (customerWalletBalance) customerWalletBalance.value = 0;
    if (applyWalletCheckbox) applyWalletCheckbox.checked = false;
  }
  
  calculateTotals();
  const pm = document.getElementById('payment-method');
  if (pm) pm.focus();
}

function clearSelectedCustomer() {
  document.getElementById('customer-id').value = '';
  document.getElementById('customer-search').value = '';
  const card = document.getElementById('selected-customer-card');
  if (card) card.style.display = 'none';

  const outstandingSection = document.getElementById('outstanding-section');
  if (outstandingSection) outstandingSection.style.display = 'none';
  const customerOutstandingBalance = document.getElementById('customer-outstanding-balance');
  if (customerOutstandingBalance) customerOutstandingBalance.value = 0;

  const walletSection = document.getElementById('wallet-section');
  if (walletSection) walletSection.style.display = 'none';
  const customerWalletBalance = document.getElementById('customer-wallet-balance');
  if (customerWalletBalance) customerWalletBalance.value = 0;

  calculateTotals();
  document.getElementById('customer-search').focus();
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
  let courier = 0;
  const ccEl = document.getElementById('courier-charges');
  if (ccEl) courier = parseFloat(ccEl.value) || 0;

  invoiceItems.forEach(item => {
    const lineTotal = item.quantity * item.unit_price;
    subtotal += lineTotal;
    discount += item.discount;
    tax += (lineTotal - item.discount) * (item.tax_rate / 100);
  });

  const currentBillGrandTotal = subtotal - discount + tax + courier;
  let netPayable = currentBillGrandTotal;
  
  // Outstanding Dues addition
  const includeOutstanding = document.getElementById('include-outstanding');
  const outstandingAdditionRow = document.getElementById('outstanding-addition-row');
  const outstandingAdditionDisplay = document.getElementById('outstanding-addition-display');
  const customerOutstandingBalance = parseFloat(document.getElementById('customer-outstanding-balance')?.value) || 0;

  let outstandingAddedAmount = 0;
  if (includeOutstanding && includeOutstanding.checked && customerOutstandingBalance > 0) {
    outstandingAddedAmount = customerOutstandingBalance;
    netPayable += outstandingAddedAmount;
    if (outstandingAdditionRow) {
      outstandingAdditionRow.style.setProperty('display', 'flex', 'important');
      outstandingAdditionDisplay.textContent = '+ ₹' + outstandingAddedAmount.toLocaleString('en-IN', {minimumFractionDigits: 2});
    }
  } else if (outstandingAdditionRow) {
    outstandingAdditionRow.style.setProperty('display', 'none', 'important');
  }

  // Wallet / Advance deduction
  const applyWallet = document.getElementById('apply-wallet');
  const walletDeductionRow = document.getElementById('wallet-deduction-row');
  const walletDeductionDisplay = document.getElementById('wallet-deduction-display');
  const customerWalletBalance = parseFloat(document.getElementById('customer-wallet-balance')?.value) || 0;
  
  let walletAppliedAmount = 0;
  if (applyWallet && applyWallet.checked && customerWalletBalance > 0) {
    walletAppliedAmount = Math.min(netPayable, customerWalletBalance);
    netPayable = Math.max(0, netPayable - walletAppliedAmount);
    if (walletDeductionRow) {
      walletDeductionRow.style.setProperty('display', 'flex', 'important');
      walletDeductionDisplay.textContent = '- ₹' + walletAppliedAmount.toLocaleString('en-IN', {minimumFractionDigits: 2});
    }
  } else if (walletDeductionRow) {
    walletDeductionRow.style.setProperty('display', 'none', 'important');
  }

  document.getElementById('subtotal-display').textContent = '₹' + subtotal.toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('discount-display').textContent = '₹' + discount.toLocaleString('en-IN', {minimumFractionDigits: 2});
  const cdEl = document.getElementById('courier-display');
  if (cdEl) cdEl.textContent = '₹' + courier.toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('grandtotal-display').textContent = '₹' + currentBillGrandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2});
  
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

  const isEditing = typeof EDIT_INVOICE_ID !== 'undefined' && EDIT_INVOICE_ID;
  const dateInputEl = document.getElementById('invoice-date');
  const data = {
    customer_id: document.getElementById('customer-id').value || null,
    payment_method: document.getElementById('payment-method').value,
    payment_status: document.getElementById('payment-status').value,
    courier_charges: document.getElementById('courier-charges') ? (parseFloat(document.getElementById('courier-charges').value) || 0) : 0,
    overall_discount: parseFloat(document.getElementById('overall-discount').value) || 0,
    invoice_type: document.getElementById('invoice-type').value,
    branch: document.getElementById('branch-select').value,
    amount_paid: parseFloat(document.getElementById('amount-paid').value) || 0,
    include_outstanding: document.getElementById('include-outstanding') ? document.getElementById('include-outstanding').checked : false,
    outstanding_amount: parseFloat(document.getElementById('customer-outstanding-balance')?.value) || 0,
    apply_wallet: document.getElementById('apply-wallet') ? document.getElementById('apply-wallet').checked : false,
    wallet_amount: parseFloat(document.getElementById('customer-wallet-balance')?.value) || 0,
    items: invoiceItems
  };
  if (dateInputEl && dateInputEl.value) {
    data.invoice_date = dateInputEl.value;
  }

  const btn = document.getElementById('submit-invoice-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

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
        notes: 'Quick adjust during billing',
        branch: document.getElementById('branch-select').value
      })
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        alert('Session expired. Please log in again.');
        window.location.href = '/login';
        return;
      }
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        alert(json.error || 'Failed to update stock (Server Error)');
      } catch (e) {
        alert('Server returned an unexpected error page.');
      }
      return;
    }

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
    console.error(err);
    alert('Error updating stock: ' + err.message);
  }
}

function openQuickCustModal() {
  const currentSearch = document.getElementById('customer-search').value.trim();
  document.getElementById('quick-cust-name').value = currentSearch;
  document.getElementById('quick-cust-phone').value = '';
  document.getElementById('quick-cust-address').value = '';
  document.getElementById('quick-cust-city').value = 'Chennai';
  document.getElementById('quick-cust-state').value = 'Tamil Nadu';
  document.getElementById('quick-cust-pincode').value = '';
  document.getElementById('quick-cust-gstin').value = '';
  document.getElementById('quick-cust-email').value = '';
  document.getElementById('quick-cust-balance').value = '0';
  
  document.getElementById('quick-customer-modal').style.display = 'flex';
  if (currentSearch) {
    document.getElementById('quick-cust-phone').focus();
  } else {
    document.getElementById('quick-cust-name').focus();
  }
}

function closeQuickCustModal() {
  document.getElementById('quick-customer-modal').style.display = 'none';
  document.getElementById('customer-search').focus();
}

async function submitQuickCust() {
  const name = document.getElementById('quick-cust-name').value.trim();
  const phone = document.getElementById('quick-cust-phone').value.trim();
  const address = document.getElementById('quick-cust-address').value.trim();
  const city = document.getElementById('quick-cust-city').value.trim();
  const state = document.getElementById('quick-cust-state').value.trim();
  const pincode = document.getElementById('quick-cust-pincode').value.trim();
  const gstin = document.getElementById('quick-cust-gstin').value.trim();
  const email = document.getElementById('quick-cust-email').value.trim();
  const opening_balance = parseFloat(document.getElementById('quick-cust-balance').value) || 0;
  
  if (!name) return alert('Customer Name is required!');
  if (!phone) return alert('Customer Phone number is required!');
  
  try {
    const res = await fetch('/customers/api/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, phone, address, city, state, pincode, gstin, email, opening_balance 
      })
    });
    const result = await res.json();
    if (result.success && result.customer) {
      closeQuickCustModal();
      selectCustomer(result.customer);
    } else {
      alert(result.error || 'Failed to add customer');
    }
  } catch(err) {
    console.error(err);
    alert('Error saving customer: ' + err.message);
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