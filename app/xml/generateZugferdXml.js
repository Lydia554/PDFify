const { create } = require('xmlbuilder2');

/**
 * Convert country name to ISO 3166-1 alpha-2 code
 * Supports common country names and returns ISO code
 */
function countryToIsoCode(countryName) {
    if (!countryName) return 'DE';

    const countryMap = {
        'Germany': 'DE',
        'Deutschland': 'DE',
        'United States': 'US',
        'USA': 'US',
        'United Kingdom': 'GB',
        'UK': 'GB',
        'France': 'FR',
        'Italy': 'IT',
        'Spain': 'ES',
        'Netherlands': 'NL',
        'Belgium': 'BE',
        'Austria': 'AT',
        'Switzerland': 'CH',
        'Poland': 'PL',
        'Czech Republic': 'CZ',
        'Slovenia': 'SI',
        'Slovakia': 'SK',
        'Hungary': 'HU',
        'Romania': 'RO',
        'Bulgaria': 'BG',
        'Croatia': 'HR',
        'Greece': 'GR',
        'Portugal': 'PT',
        'Ireland': 'IE',
        'Sweden': 'SE',
        'Norway': 'NO',
        'Denmark': 'DK',
        'Finland': 'FI',
        'Luxembourg': 'LU',
        'Estonia': 'EE',
        'Latvia': 'LV',
        'Lithuania': 'LT',
        'Malta': 'MT',
        'Cyprus': 'CY'
    };

    // If already 2-letter ISO code, return as-is
    if (countryName.length === 2 && /^[A-Z]{2}$/i.test(countryName)) {
        return countryName.toUpperCase();
    }

    return countryMap[countryName] || 'DE';
}

function generateZugferdXml(invoiceData) {
    const {
        orderId, date, dueDate, currency = 'EUR',
        customerName, companyName, iban, items = [],
        subtotal, tax, total, sellerAddress, buyerAddress, sellerVatId,
        vatRate // Use vatRate from invoiceData
    } = invoiceData;

    const formattedDate = date.replace(/-/g, '');
    const formattedDueDate = dueDate ? dueDate.replace(/-/g, '') : formattedDate;

    // Calculate tax rate from actual item data, not from placeholder
    // This gives us the REAL tax rate being applied
    let actualTaxRate = 19; // default fallback

    if (items.length > 0 && items[0] && items[0].tax && items[0].net && items[0].net > 0) {
        // Calculate from first item: (tax / net) * 100
        const itemTax = parseFloat(items[0].tax) || 0;
        const itemNet = parseFloat(items[0].net) || 0;
        if (itemNet > 0) {
            actualTaxRate = (itemTax / itemNet) * 100;
        }
    } else if (subtotal > 0 && tax > 0) {
        // Fallback: calculate from totals
        actualTaxRate = (tax / subtotal) * 100;
    }

    // Round to 2 decimal places for consistency
    const finalTaxRate = Math.round(actualTaxRate * 100) / 100;

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('rsm:CrossIndustryInvoice', {
            'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
            'xmlns:ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
            'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100'
        });

    // 1. Context - UPDATED TO THE PURE EN16931 IDENTIFIER
    // This is the most strict value for the COMFORT/EN16931 profile
    doc.ele('rsm:ExchangedDocumentContext')
        .ele('ram:GuidelineSpecifiedDocumentContextParameter')
            .ele('ram:ID').txt('urn:cen.eu:en16931:2017').up()
        .up()
    .up();

    // 2. Document Header
    doc.ele('rsm:ExchangedDocument')
        .ele('ram:ID').txt(orderId).up()
        .ele('ram:TypeCode').txt('380').up()
        .ele('ram:IssueDateTime')
            .ele('udt:DateTimeString', { format: '102' }).txt(formattedDate).up()
        .up()
    .up();

    const transaction = doc.ele('rsm:SupplyChainTradeTransaction');

    // 3. Line Items
    items.forEach((item, index) => {
        const lineItem = transaction.ele('ram:IncludedSupplyChainTradeLineItem');
        lineItem.ele('ram:AssociatedDocumentLineDocument').ele('ram:LineID').txt(index + 1).up().up();
        lineItem.ele('ram:SpecifiedTradeProduct').ele('ram:Name').txt(item.name).up().up();
        lineItem.ele('ram:SpecifiedLineTradeAgreement')
            .ele('ram:NetPriceProductTradePrice').ele('ram:ChargeAmount').txt((item.net || item.price / (1 + finalTaxRate/100)).toFixed(2)).up().up().up();
        lineItem.ele('ram:SpecifiedLineTradeDelivery')
            .ele('ram:BilledQuantity', { unitCode: 'C62' }).txt(item.quantity.toFixed(4)).up().up();
        lineItem.ele('ram:SpecifiedLineTradeSettlement')
            .ele('ram:ApplicableTradeTax')
                .ele('ram:TypeCode').txt('VAT').up()
                .ele('ram:CategoryCode').txt('S').up()
                .ele('ram:RateApplicablePercent').txt(finalTaxRate.toFixed(2)).up().up()
            .ele('ram:SpecifiedTradeSettlementLineMonetarySummation')
                .ele('ram:LineTotalAmount').txt((item.net || (item.price * item.quantity / (1 + finalTaxRate/100))).toFixed(2)).up().up().up();
    });


    // 4. Agreement (Seller/Buyer + Addresses + VAT ID)
    const agreement = transaction.ele('ram:ApplicableHeaderTradeAgreement');

    const seller = agreement.ele('ram:SellerTradeParty');
    seller.ele('ram:Name').txt(companyName).up();
    seller.ele('ram:PostalTradeAddress')
        .ele('ram:PostcodeCode').txt(sellerAddress.postCode).up()
        .ele('ram:LineOne').txt(sellerAddress.street).up()
        .ele('ram:CityName').txt(sellerAddress.city).up()
        .ele('ram:CountryID').txt(countryToIsoCode(sellerAddress.country)).up().up();
    seller.ele('ram:SpecifiedTaxRegistration')
        .ele('ram:ID', { schemeID: 'VA' }).txt(sellerVatId).up().up();

    const buyer = agreement.ele('ram:BuyerTradeParty');
    buyer.ele('ram:Name').txt(customerName).up();
    buyer.ele('ram:PostalTradeAddress')
        .ele('ram:PostcodeCode').txt(buyerAddress.postCode).up()
        .ele('ram:LineOne').txt(buyerAddress.street).up()
        .ele('ram:CityName').txt(buyerAddress.city).up()
        .ele('ram:CountryID').txt(countryToIsoCode(buyerAddress.country)).up().up();

    // 5. Delivery
    transaction.ele('ram:ApplicableHeaderTradeDelivery')
        .ele('ram:ActualDeliverySupplyChainEvent')
            .ele('ram:OccurrenceDateTime')
                .ele('udt:DateTimeString', { format: '102' }).txt(formattedDate).up().up().up();

    // 6. Settlement
    const settlement = transaction.ele('ram:ApplicableHeaderTradeSettlement');
    settlement.ele('ram:InvoiceCurrencyCode').txt(currency).up();
    settlement.ele('ram:SpecifiedTradeSettlementPaymentMeans')
        .ele('ram:TypeCode').txt('30').up()
        .ele('ram:PayeePartyCreditorFinancialAccount').ele('ram:IBANID').txt(iban).up().up().up();

    // Calculate tax from subtotal and rate to ensure accuracy
    const calculatedTax = subtotal * (finalTaxRate / 100);
    const calculatedTotal = subtotal + calculatedTax;

    settlement.ele('ram:ApplicableTradeTax')
        .ele('ram:CalculatedAmount').txt(calculatedTax.toFixed(2)).up()
        .ele('ram:TypeCode').txt('VAT').up()
        .ele('ram:BasisAmount').txt(subtotal.toFixed(2)).up()
        .ele('ram:CategoryCode').txt('S').up()
        .ele('ram:RateApplicablePercent').txt(finalTaxRate.toFixed(2)).up().up();

    settlement.ele('ram:SpecifiedTradePaymentTerms')
        .ele('ram:DueDateDateTime').ele('udt:DateTimeString', { format: '102' }).txt(formattedDueDate).up().up().up();

    settlement.ele('ram:SpecifiedTradeSettlementHeaderMonetarySummation')
        .ele('ram:LineTotalAmount').txt(subtotal.toFixed(2)).up()
        .ele('ram:TaxBasisTotalAmount').txt(subtotal.toFixed(2)).up()
        .ele('ram:TaxTotalAmount', { currencyID: currency }).txt(calculatedTax.toFixed(2)).up()
        .ele('ram:GrandTotalAmount').txt(calculatedTotal.toFixed(2)).up()
        .ele('ram:DuePayableAmount').txt(calculatedTotal.toFixed(2)).up().up();

    return doc.end({ prettyPrint: false });
}

module.exports = generateZugferdXml;