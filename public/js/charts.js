function initDashboardChart(salesData) {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;
  
  const labels = salesData.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  });
  const values = salesData.map(d => d.total);
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sales (₹)',
        data: values,
        backgroundColor: 'rgba(20, 184, 166, 0.6)',
        borderColor: '#14b8a6',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.05)' } },
        y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.05)' } }
      }
    }
  });
}

function initSalesReportChart(salesData) {
  const ctx = document.getElementById('salesReportChart');
  if (!ctx) return;
  
  const labels = salesData.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  });
  const sales = salesData.map(d => d.total);
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Sales (₹)',
          data: sales,
          borderColor: '#14b8a6',
          backgroundColor: 'rgba(20, 184, 166, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.05)' } },
        y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, 0.05)' } }
      }
    }
  });
}