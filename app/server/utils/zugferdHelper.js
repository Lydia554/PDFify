// zugferdHelper.js
const { create } = require('xmlbuilder2');

function generateZugferdXML(invoiceData) {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rsm:CrossIndustryInvoice', {
      'xmlns:rsm': 'urn:ferd:CrossIndustryDocument:invoice:1p0',
      'xmlns:ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
      'xmlns:qdt': 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
      'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
    })
    .ele('rsm:ExchangedDocument')
    .ele('ram:ID').txt(invoiceData.orderId).up()
    .ele('ram:TypeCode').txt('380').up()
    .ele('ram:IssueDateTime')
    .ele('udt:DateTimeString', { format: '102' }).txt(invoiceData.date.replace(/-/g, '')).up()
    .up()
    .up()
    .ele('rsm:SupplyChainTradeTransaction')
    .ele('ram:ApplicableHeaderTradeAgreement')
    .ele('ram:BuyerTradeParty')
    .ele('ram:Name').txt(invoiceData.customerName).up()
    .up()
    .up()
    .ele('ram:ApplicableHeaderTradeDelivery')
    .ele('ram:ActualDeliverySupplyChainEvent')
    .ele('ram:OccurrenceDateTime')
    .ele('udt:DateTimeString', { format: '102' }).txt(invoiceData.date.replace(/-/g, '')).up()
    .up()
    .up()
    .up()
    .ele('ram:ApplicableHeaderTradeSettlement')
    .ele('ram:PaymentReference').txt(invoiceData.orderId).up()
    .ele('ram:InvoiceCurrencyCode').txt('EUR').up()
    .up()
    .ele('ram:IncludedSupplyChainTradeLineItem');

  invoiceData.items.forEach((item, index) => {
    doc.ele('ram:AssociatedDocumentLineDocument')
      .ele('ram:LineID').txt(index + 1).up()
      .ele('ram:IncludedNote').txt(item.name).up()
      .up();
  });

  return doc.end({ prettyPrint: true });
}

module.exports = {
  generateZugferdXML,
};
