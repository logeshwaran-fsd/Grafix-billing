function toggleAllChecks(source) {
  const checkboxes = document.querySelectorAll('.product-check');
  checkboxes.forEach(cb => cb.checked = source.checked);
  updateBulkButtons();
}

function updateBulkButtons() {
  const checkboxes = document.querySelectorAll('.product-check:checked');
  const btnEdit = document.getElementById('btn-bulk-edit');
  const btnDelete = document.getElementById('btn-bulk-delete');
  
  const hasSelection = checkboxes.length > 0;
  if(btnEdit) btnEdit.disabled = !hasSelection;
  if(btnDelete) btnDelete.disabled = !hasSelection;
}

function getSelectedIds() {
  const checkboxes = document.querySelectorAll('.product-check:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function openBulkEditModal() {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  
  document.getElementById('bulk-edit-ids').value = JSON.stringify(ids);
  document.getElementById('bulk-edit-modal').style.display = 'flex';
}

function closeBulkEditModal() {
  document.getElementById('bulk-edit-modal').style.display = 'none';
}

function toggleBulkEditInputs() {
  const field = document.getElementById('bulk-edit-field').value;
  document.getElementById('bulk-val-brand').style.display = field === 'category_id' ? 'block' : 'none';
  document.getElementById('bulk-val-gst').style.display = field === 'gst_rate' ? 'block' : 'none';
  document.getElementById('bulk-val-unit').style.display = field === 'unit' ? 'block' : 'none';
}

function bulkDelete() {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  
  if (confirm('Are you sure you want to delete ' + ids.length + ' products?')) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/products/bulk-delete';
    
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'product_ids';
    input.value = JSON.stringify(ids);
    
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }
}

function deleteAllProducts() {
  const confirmText = prompt('⚠️ DANGER: This will delete ALL products in your inventory!\n\nType "DELETE ALL" to confirm:');
  if (confirmText === 'DELETE ALL') {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/products/delete-all';
    document.body.appendChild(form);
    form.submit();
  } else if (confirmText !== null) {
    alert('Action cancelled: You must type "DELETE ALL" exactly to confirm deletion.');
  }
}
