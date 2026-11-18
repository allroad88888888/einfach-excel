"""Hand-authored OOXML; independent of the product's importer/exporter."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
parts = {
    '[Content_Types].xml': '''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>''',
    '_rels/.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': f'<workbook xmlns="{NS}" xmlns:r="{REL}"><sheets><sheet name="Shrink" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{REL}/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': f'''<styleSheet xmlns="{NS}">
      <fonts count="2"><font><sz val="16"/><name val="Arial"/></font><font><sz val="24"/><name val="Arial"/></font></fonts>
      <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
      <borders count="1"><border/></borders>
      <cellXfs count="4">
        <xf numFmtId="0" fontId="0"/>
        <xf numFmtId="0" fontId="0" applyAlignment="1"><alignment shrinkToFit="1"/></xf>
        <xf numFmtId="0" fontId="0" applyAlignment="1"><alignment shrinkToFit="true" wrapText="true"/></xf>
        <xf numFmtId="0" fontId="1" applyAlignment="1" applyFont="1"><alignment shrinkToFit="0" wrapText="0"/></xf>
      </cellXfs></styleSheet>''',
    'xl/worksheets/sheet1.xml': f'''<worksheet xmlns="{NS}"><cols><col min="1" max="1" width="12" customWidth="1" style="1"/></cols><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Inherited long identifier 123456789</t></is></c><c r="B1" s="2" t="inlineStr"><is><t>Wrapping wins over shrinking</t></is></c><c r="C1" s="1" t="inlineStr"><is><t>Short</t></is></c><c r="D1"><v>12.5</v></c><c r="E1" s="1"><f>D1*2</f><v>25</v></c></row>
      <row r="2"><c r="A2" s="3" t="inlineStr"><is><t>Explicit false keeps 24px</t></is></c></row>
      <row r="3" s="2" customFormat="1"><c r="B3" t="inlineStr"><is><r><t>H</t></r><r><rPr><vertAlign val="subscript"/><b/><sz val="20"/></rPr><t>2</t></r><r><t>O</t></r></is></c></row>
      </sheetData></worksheet>''',
}

with ZipFile(Path(__file__).with_name('shrink-external.xlsx'), 'w') as archive:
    for name, body in parts.items():
        entry = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, body)
