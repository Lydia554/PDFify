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

  // Parse tax rate from CSV (e.g., "19%" -> 19)
  const taxRateValue = first.taxRate || "19%";
  const taxRateNumber = parseFloat(taxRateValue.replace(/[^\d.]/g, '')) || 19;

  return {
    customerName: first.customerName || "",
    customerEmail: first.customerEmail || "",
    customerAddress: `${first.buyerAddress_street || ''}, ${first.buyerAddress_city || ''}, ${first.buyerAddress_postCode || ''}, ${first.buyerAddress_country || ''}`,
    orderId: first.orderId || "",
    country: first.country || "",
    date: first.date || "",
    currency: first.currency || "EUR",
    taxRate: taxRateValue,
    vatRate: taxRateNumber,
    paymentTerms: first.paymentTerms || "Due within 14 days",
    items: rows.map(r => ({
      name: r.itemName || "",
      quantity: Number(r.quantity || 0),
      price: cleanNumber(r.price),
      net: cleanNumber(r.itemTotal) - cleanNumber(r.itemTax),
      tax: cleanNumber(r.itemTax),
      total: cleanNumber(r.itemTotal),
      taxRate: taxRateNumber,
      position: r.position || "1"
    })),
    subtotal: cleanNumber(first.subtotal),
    tax: cleanNumber(first.totalTax),
    total: cleanNumber(first.total),
    iban: first.iban || "",
    bic: first.bic || "",
    bankName: first.bankName || "",
    companyName: first.companyName || "Your Company",
    shopName: first.companyName || "Your Shop",
    shopAddress: `${first.sellerAddress_street || ''}, ${first.sellerAddress_postCode || ''}, ${first.sellerAddress_city || ''}`,
    sellerVatId: first.sellerVatId || "",
    sellerAddress: {
      street: first.sellerAddress_street || "",
      postCode: first.sellerAddress_postCode || "",
      city: first.sellerAddress_city || "",
      country: first.sellerAddress_country || "DE"
    },
    buyerAddress: {
      street: first.buyerAddress_street || "",
      postCode: first.buyerAddress_postCode || "",
      city: first.buyerAddress_city || "",
      country: first.buyerAddress_country || "DE"
    }
  };
}
