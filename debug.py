from lxml import etree

xml_file = r"C:\Users\goldb\Pro\zugferd\Examples\3. EN16931\EN16931_1_Teilrechnung\EN16931_1_Teilrechnung.xml"
xsd_file = r"C:\Users\goldb\Pro\zugferd\Schema\3. Factur-X_1.07.3_EN16931\Factur-X_1.07.3_EN16931.xsd"

# parse XSD
with open(xsd_file, 'rb') as f:
    schema_doc = etree.parse(f)
schema = etree.XMLSchema(schema_doc)

# parse XML
with open(xml_file, 'rb') as f:
    xml_doc = etree.parse(f)

# validate
if schema.validate(xml_doc):
    print("XML is valid ✅")
else:
    print("XML is invalid ❌")
    for error in schema.error_log:
        print(error.message)
