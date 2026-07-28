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
    input.typd = 'hidden';
    input.namd = 'product_ids';
    input.value = JSON.stringify(ids);
    
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }
}
