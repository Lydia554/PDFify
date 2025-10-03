// --- CSV Parsing ---
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (!lines.length) return [];
  const headers = lines.shift().split(",").map(h => h.trim());
  return lines.map(line => {
    const values = line.split(",");
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i]?.trim() || "";
    });
    return obj;
  });
}

// --- Group by orderId ---
function groupRowsByOrderId(rows) {
  const grouped = {};
  rows.forEach(row => {
    const orderId = row.orderId || `order-${Date.now()}`;
    if (!grouped[orderId]) grouped[orderId] = [];
    grouped[orderId].push(row);
  });
  return Object.values(grouped);
}

// --- Convert grouped rows to invoice JSON ---
function rowsToInvoiceJson(rows) {
  if (!rows.length) return null;
  const first = rows[0];
  return {
    customerName: first.customerName,
    customerEmail: first.customerEmail,
    orderId: first.orderId,
    country: first.country,
    date: first.date,
    iban: first.iban || "",
    bic: first.bic || "",
    items: rows.map(r => ({
      name: r.itemName,
      quantity: Number(r.quantity || 0),
      price: parseFloat(r.price || 0),
      total: parseFloat(r.itemTotal || 0),
      tax: parseFloat(r.itemTax || 0),
      position: r.position || ""
    })),
    subtotal: parseFloat(first.subtotal || 0),
    tax: parseFloat(first.totalTax || 0),
    total: parseFloat(first.total || 0),
    customLogoUrl: first.customLogoUrl || "",
    showChart: (first.showChart || "").toLowerCase() === "true",
    isPremium: (first.isPremium || "").toLowerCase() === "true",
  };
}

// --- Frontend CSV generation ---
document.getElementById('csvGenerateBtn').addEventListener('click', async () => {
  const file = document.getElementById('csvUpload').files[0];
  if (!file) return alert('Please upload a CSV file first.');

  const progressBar = document.getElementById('progressBar');
  const progressCount = document.getElementById('progressCount');
  const progressTotal = document.getElementById('progressTotal');
  const csvResult = document.getElementById('csvResult');
  document.getElementById('csvProgress').classList.remove('hidden');

  progressBar.style.width = '0%';
  progressCount.textContent = '0';

  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) return alert('Please enter your API key.');

  const text = await file.text();
  let rows;
  try { rows = parseCSV(text); } catch { return alert('Invalid CSV format.'); }

  const groupedInvoices = groupRowsByOrderId(rows);
  const requests = groupedInvoices.map(rowsToInvoiceJson).map(data => ({ data, isPreview: false }));

  const total = requests.length;
  let completed = 0;
  progressTotal.textContent = total;

  const zip = new JSZip();

  const updateProgress = () => {
    completed++;
    const percent = Math.round((completed / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressCount.textContent = completed;
  };

  try {
    for (const req of requests) {
      const res = await fetch('/api/generate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ requests: [req] })
      });

      if (!res.ok) throw new Error(await res.text());

      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = 'invoice.pdf';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^;\r\n"]+)"/i);
        if (match) filename = decodeURIComponent(match[1]);
      }

      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      zip.file(filename, arrayBuffer);
      updateProgress();
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "invoices.zip";
    a.click();
    URL.revokeObjectURL(url);

    csvResult.innerHTML = `<span class="text-green-600">✅ ${total} invoices downloaded.</span>`;
  } catch (err) {
    csvResult.innerHTML = `<span class="text-red-400">❌ Error: ${err.message}</span>`;
  }
});
