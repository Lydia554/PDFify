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


function cleanNumber(str) {
  if (!str) return 0;
  const num = parseFloat(str.replace(/[^\d.-]/g, ""));
  return isNaN(num) ? 0 : num;
}

function rowsToInvoiceJson(rows) {
  if (!rows.length) return null;
  const first = rows[0];
  return {
    customerName: first.customerName || "",
    customerEmail: first.customerEmail || "",
    orderId: first.orderId || "",
    country: first.country || "",
    date: first.date || "",
    items: rows.map(r => ({
      name: r.itemName || "",
      quantity: Number(r.quantity || 0),
      price: cleanNumber(r.price),
      priceFormatted: r.price || "",
      total: cleanNumber(r.itemTotal),
      totalFormatted: r.itemTotal || "",
      tax: cleanNumber(r.itemTax),
      taxFormatted: r.itemTax || "",
      position: r.position || ""
    })),
    subtotal: cleanNumber(first.subtotal),
    subtotalFormatted: first.subtotal || "",
    tax: cleanNumber(first.totalTax),
    taxFormatted: first.totalTax || "",
    total: cleanNumber(first.total),
    totalFormatted: first.total || "",
    customLogoUrl: first.customLogoUrl || "",
    showChart: (first.showChart || "").toLowerCase() === "true",
    isPremium: (first.isPremium || "").toLowerCase() === "true",
    iban: first.iban || "",
    bic: first.bic || "",
    compliant: (first.compliant || "").toLowerCase() === "true",
    planType: (first.planType || "").toLowerCase(),
    locale: first.locale || {}  // pass full locale for footer
  };
}
