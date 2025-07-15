
  
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines.shift().split(",");
  return lines.map(line => {
    const values = line.split(",");
    return headers.reduce((obj, header, i) => {
      obj[header.trim()] = values[i]?.trim();
      return obj;
    }, {});
  });
}

function groupRowsByOrderId(rows) {
  const grouped = {};

  rows.forEach(row => {
    const orderId = row.orderId;
    if (!grouped[orderId]) {
      grouped[orderId] = [];
    }
    grouped[orderId].push(row);
  });

  return Object.values(grouped);
}

function rowsToInvoiceJson(rows) {
  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    customerName: first.customerName,
    customerEmail: first.customerEmail,
    orderId: first.orderId,
    country: first.country,
    date: first.date,
    items: rows.map(r => ({
      name: r.itemName,
      quantity: Number(r.quantity),
      price: r.price,
      total: r.itemTotal,
      tax: r.itemTax,
      position: r.position,
    })),
    subtotal: first.subtotal,
    tax: first.totalTax,
    total: first.total,
    customLogoUrl: first.customLogoUrl,
    showChart: (first.showChart || '').toLowerCase() === "true",
    isPremium: (first.isPremium || '').toLowerCase() === "true",
  };
}

document.getElementById('csvGenerateBtn').addEventListener('click', async () => {
  const file = document.getElementById('csvUpload').files[0];
  if (!file) {
    alert('Please upload a CSV file first.');
    return;
  }

  document.getElementById('csvResult').textContent = '';
  const progressBar = document.getElementById('progressBar');
  const progressCount = document.getElementById('progressCount');
  progressBar.style.width = '0%';
  progressCount.textContent = '0';
  document.getElementById('csvProgress').classList.remove('hidden');

  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    alert('Please enter your API key.');
    return;
  }

  const text = await file.text();
  let data;
  try {
    data = parseCSV(text);
  } catch (e) {
    alert('Invalid CSV format.');
    return;
  }

  const groupedInvoices = groupRowsByOrderId(data);
  const total = groupedInvoices.length;
  let completed = 0;
  const results = [];

  for (const invoiceRows of groupedInvoices) {
    const invoiceJson = rowsToInvoiceJson(invoiceRows);

    try {
      const res = await fetch('/api/generate-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          requests: [{ data: invoiceJson, isPreview: true }]
        })
      });

      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      results.push(`<a href="${url}" download="invoice-${invoiceJson.orderId}.pdf">📄 Invoice #${invoiceJson.orderId}</a>`);
    } catch (err) {
      results.push(`<span class="text-red-400">❌ Error for invoice #${invoiceJson.orderId}: ${err.message}</span>`);
    }

    completed++;
    progressBar.style.width = `${(completed / total) * 100}%`;
    progressCount.textContent = completed;
  }

  document.getElementById('csvResult').innerHTML = results.join('<br>');
});

