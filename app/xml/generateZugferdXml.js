const { create } = require('xmlbuilder2');

function generateZugferdXml(invoiceData) {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rsm:CrossIndustryInvoice', {
      'xmlns:rsm': 'urn:ferd:CrossIndustryDocument:invoice:1p0'
    })
      .ele('rsm:ExchangedDocument')
        .ele('ram:ID').txt(invoiceData.orderId).up()
        .ele('ram:IssueDateTime')
          .ele('udt:DateTimeString', { format: '102' })
          .txt(invoiceData.date)
        .up().up()
      .up()
      .ele('rsm:SupplyChainTradeTransaction')
        .ele('ram:IncludedSupplyChainTradeLineItem');

  invoiceData.items.forEach(item => {
    doc.ele('ram:TradeProduct')
      .ele('ram:Name').txt(item.name).up()
    .up()
      .ele('ram:SpecifiedLineTradeAgreement')
        .ele('ram:GrossPriceProductTradePrice')
          .ele('ram:ChargeAmount').txt(item.price.toFixed(2)).up()
        .up()
      .up()
      .ele('ram:SpecifiedLineTradeDelivery')
        .ele('ram:BilledQuantity', { unitCode: item.unitCode || 'EA' }).txt(item.quantity).up()
      .up()
      .ele('ram:SpecifiedLineTradeSettlement')
        .ele('ram:ApplicableTradeTax')
          .ele('ram:CalculatedAmount').txt(item.tax.toFixed(2)).up()
          .ele('ram:TypeCode').txt('VAT').up()
          .ele('ram:CategoryCode').txt('S').up()
          .ele('ram:RateApplicablePercent').txt(item.taxRate.toFixed(2)).up()
        .up()
        .ele('ram:SpecifiedTradeSettlementLineMonetarySummation')
          .ele('ram:LineTotalAmount').txt(item.total.toFixed(2)).up()
        .up()
      .up()
    .up();
  });

  return doc.end({ prettyPrint: true });
}

module.exports = generateZugferdXml;
