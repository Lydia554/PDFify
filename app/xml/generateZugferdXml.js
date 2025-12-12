const { create } = require('xmlbuilder2');

/**
 * Generates a ZUGFeRD 2.3 (Factur-X) compliant XML string for an invoice.
 * This function creates an XML structure following the EN 16931 (COMFORT) profile.
 *
 * @param {object} invoiceData - The invoice data.
 * @param {string} invoiceData.orderId - The invoice ID.
 * @param {string} invoiceData.date - The invoice issue date (YYYY-MM-DD).
 * @param {string} invoiceData.currency - The currency code (e.g., 'EUR').
 * @param {string} invoiceData.customerName - The buyer's name.
 * @param {string} invoiceData.companyName - The seller's name.
 * @param {string} invoiceData.iban - The seller's IBAN.
 * @param {Array<object>} invoiceData.items - The line items.
 * @param {string} item.name - The item description.
 * @param {number} item.quantity - The item quantity.
 * @param {number} item.price - The net price per unit.
 * @param {number} item.total - The total net amount for the line.
 * @param {number} item.taxRate - The VAT rate percentage (e.g., 19).
 * @param {number} subtotal - The total net amount for the invoice.
 * @param {number} tax - The total VAT amount for the invoice.
 * @param {number} total - The grand total for the invoice.
 *
 * @returns {string} The generated XML as a string.
 */
function generateZugferdXml(invoiceData) {
    const {
        orderId,
        date,
        currency = 'EUR',
        customerName = 'Unknown Customer',
        companyName = 'Unknown Company',
        iban,
        items = [],
        subtotal = 0,
        tax = 0,
        total = 0,
    } = invoiceData;

    // Convert date to the required 102 format (YYYYMMDD)
    const formattedDate = date.replace(/-/g, '');

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('rsm:CrossIndustryInvoice', {
            'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
            'xmlns:ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
            'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100'
        })
        // Document Context
        .ele('rsm:ExchangedDocumentContext')
            .ele('ram:GuidelineSpecifiedDocumentContextParameter')
                .ele('ram:ID').txt('urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:comfort').up()
            .up()
        .up()
        // Header
        .ele('rsm:ExchangedDocument')
            .ele('ram:ID').txt(orderId).up()
            .ele('ram:TypeCode').txt('380').up() // 380 = Commercial Invoice
            .ele('ram:IssueDateTime')
                .ele('udt:DateTimeString', { format: '102' }).txt(formattedDate).up()
            .up()
        .up()
        // Trade Transaction
        .ele('rsm:SupplyChainTradeTransaction');

    // Add line items
    items.forEach((item, index) => {
        const lineTotal = (item.price * item.quantity).toFixed(2);

        doc.ele('ram:IncludedSupplyChainTradeLineItem')
            .ele('ram:AssociatedDocumentLineDocument')
                .ele('ram:LineID').txt(index + 1).up()
            .up()
            .ele('ram:SpecifiedTradeProduct')
                .ele('ram:Name').txt(item.name).up()
            .up()
            .ele('ram:SpecifiedLineTradeAgreement')
                .ele('ram:NetPriceProductTradePrice')
                    .ele('ram:ChargeAmount').txt(item.price.toFixed(2)).up()
                .up()
            .up()
            .ele('ram:SpecifiedLineTradeDelivery')
                .ele('ram:BilledQuantity', { unitCode: 'C62' }).txt(item.quantity.toFixed(4)).up() // C62 is standard for "one" or "unit"
            .up()
            .ele('ram:SpecifiedLineTradeSettlement')
                .ele('ram:ApplicableTradeTax')
                    .ele('ram:TypeCode').txt('VAT').up()
                    .ele('ram:CategoryCode').txt('S').up() // Standard rate
                    .ele('ram:RateApplicablePercent').txt(item.taxRate.toFixed(2)).up()
                .up()
                .ele('ram:SpecifiedTradeSettlementLineMonetarySummation')
                    .ele('ram:LineTotalAmount').txt(lineTotal).up()
                .up()
            .up()
        .up();
    });

    // Seller
    doc.ele('ram:ApplicableHeaderTradeAgreement')
        .ele('ram:SellerTradeParty')
            .ele('ram:Name').txt(companyName).up()
        .up()
        // Buyer
        .ele('ram:BuyerTradeParty')
            .ele('ram:Name').txt(customerName).up()
        .up()
    .up();

    // Delivery - Add a minimal compliant delivery section.
    doc.ele('ram:ApplicableHeaderTradeDelivery')
        .ele('ram:ShipToTradeParty')
            .ele('ram:Name').txt(customerName).up()
        .up()
    .up();

    // Monetary Summary & VAT Breakdown
    doc.ele('ram:ApplicableHeaderTradeSettlement')
        .ele('ram:InvoiceCurrencyCode').txt(currency).up()
        // Payment Means - must be wrapped in SpecifiedTradeSettlementPaymentMeans
        .ele('ram:SpecifiedTradeSettlementPaymentMeans')
            .ele('ram:TypeCode').txt('30').up() // 30 = Credit Transfer
            .ele('ram:PayeeFinancialAccount')
                .ele('ram:IBANID').txt(iban || 'DE12345678901234567890').up()
            .up()
        .up()
        // Overall VAT Breakdown
        .ele('ram:ApplicableTradeTax')
            .ele('ram:CalculatedAmount').txt(tax.toFixed(2)).up()
            .ele('ram:TypeCode').txt('VAT').up()
            .ele('ram:BasisAmount').txt(subtotal.toFixed(2)).up()
            .ele('ram:CategoryCode').txt('S').up() // Standard rate
            .ele('ram:RateApplicablePercent').txt(invoiceData.vatRate ? invoiceData.vatRate.toFixed(2) : '0.00').up() // Assuming a single rate for simplicity
        .up()
        // Monetary Summary
        .ele('ram:SpecifiedTradeSettlementHeaderMonetarySummation')
            .ele('ram:LineTotalAmount').txt(subtotal.toFixed(2)).up()
            .ele('ram:TaxBasisTotalAmount').txt(subtotal.toFixed(2)).up()
            .ele('ram:TaxTotalAmount', { currencyID: currency }).txt(tax.toFixed(2)).up()
            .ele('ram:GrandTotalAmount').txt(total.toFixed(2)).up()
            .ele('ram:DuePayableAmount').txt(total.toFixed(2)).up()
        .up()
    .up();

    const xmlString = doc.end({ prettyPrint: true });
    return xmlString;
}

module.exports = generateZugferdXml;