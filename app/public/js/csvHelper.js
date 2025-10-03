function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (!lines.length) return [];
  const headers = lines.shift().split(",").map(h => h.trim());
  return lines.map(line => {
    const values = line.split(",");
    const obj = {};
    headers.forEach((header, i) => obj[header] = values[i]?.trim() || "");
    return obj;
  });
}

function groupRowsByOrderId(rows) {
  const grouped = {};
  rows.forEach(row => {
    const orderId = row.orderId || `order-${Date.now()}`;
    if (!grouped[orderId]) grouped[orderId] = [];
    grouped[orderId].push(row);
  });
  return Object.values(grouped);
}

function rowsToInvoiceJson(rows) {
  if (!rows.length) return null;
  const first = rows[0];
  return {
    customerName: first.customerName,
    customerEmail: first.customerEmail,
    orderId: first.orderId,
    country: first.country,
    date: first.date,
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