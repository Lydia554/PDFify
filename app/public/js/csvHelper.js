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

ddocument.getElementById('csvGenerateBtn').addEventListener('click', async () => {
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
    isPreview: false,
    customLogoUrl: rows[0].customLogoUrl,
  }));

  const total = requests.length;
  let completed = 0;
  const zip = new JSZip();

  const updateProgress = () => {
    completed++;
    const percent = Math.round((completed / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressCount.textContent = `${completed}/${total}`;
  };

  try {
    for (const req of requests) {
      const res = await fetch('/api/generate-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ requests: [req] }) 
      });

      if (!res.ok) throw new Error(await res.text());

      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = 'invoice.pdf';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      zip.file(filename, arrayBuffer);

      updateProgress();
    }

    // Create one ZIP after all invoices
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "invoices.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    document.getElementById('csvResult').innerHTML = `<span class="text-green-600">✅ ${total} invoices downloaded.</span>`;

  } catch (err) {
    document.getElementById('csvResult').innerHTML = `<span class="text-red-400">❌ Error: ${err.message}</span>`;
  }
});
