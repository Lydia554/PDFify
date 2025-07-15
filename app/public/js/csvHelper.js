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
  const requests = groupedInvoices.map(rows => ({
    data: rowsToInvoiceJson(rows),
    isPreview: true
  }));

  try {
    const res = await fetch('/api/generate-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ requests })
    });

    if (!res.ok) throw new Error(await res.text());

    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('zip')) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'invoices.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      progressBar.style.width = '100%';
      progressCount.textContent = requests.length;
      document.getElementById('csvResult').innerHTML = `<span class="text-green-600">✅ ZIP with ${requests.length} invoices downloaded.</span>`;
    } else {
      const text = await res.text();
      document.getElementById('csvResult').textContent = `Unexpected response: ${text}`;
    }
  } catch (err) {
    document.getElementById('csvResult').innerHTML = `<span class="text-red-400">❌ Error: ${err.message}</span>`;
  }
});
