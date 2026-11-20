"""Hand-authored SpreadsheetML diagonal flags; no product serializer participates."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
parts = {
    '[Content_Types].xml': '''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>''',
    '_rels/.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': f'<workbook xmlns="{NS}" xmlns:r="{REL}"><sheets><sheet name="Diagonals" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{REL}/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': f'''<styleSheet xmlns="{NS}">
      <fonts count="1"><font><sz val="16"/><name val="Arial"/></font></fonts>
      <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
      <borders count="8"><border/>
        <border diagonalDown="1"><bottom style="medium"><color rgb="FF123ABC"/></bottom><diagonal style="thin"><color rgb="FFC00000"/></diagonal></border>
        <border diagonalUp="true"><diagonal style="dotted"><color indexed="4"/></diagonal></border>
        <border diagonalDown="true" diagonalUp="1"><diagonal style="double"><color rgb="FF008000"/></diagonal></border>
        <border diagonalDown="false" diagonalUp="0"><diagonal style="thick"><color rgb="FFFF0000"/></diagonal></border>
        <border diagonalDown="1"><diagonal/></border>
        <border diagonalUp="1"><diagonal style="unsupportedLine"><color rgb="FFFF0000"/></diagonal></border>
        <border diagonalDown="1"><bottom style="medium"/><diagonal style="thin"><color rgb="FFFF00FF"/></diagonal></border>
      </borders><cellXfs count="8">{''.join(f'<xf numFmtId="0" fontId="0" borderId="{i}" applyBorder="1"/>' for i in range(8))}</cellXfs>
    </styleSheet>''',
    'xl/worksheets/sheet1.xml': f'''<worksheet xmlns="{NS}"><sheetFormatPr defaultRowHeight="36" defaultColWidth="18"/><sheetData>
      <row r="1">{''.join(f'<c r="{chr(65+i)}1" s="{i+1}" t="inlineStr"><is><t>{name}</t></is></c>' for i, name in enumerate(['Down', 'Up', 'Both', 'Off', 'No style', 'Unsupported', 'Separate color']))}</row>
      <row r="3"><c r="A3" s="3" t="inlineStr"><is><t>Merged diagonals</t></is></c><c r="D3"><f>12*2</f><v>24</v></c></row>
      </sheetData><mergeCells count="1"><mergeCell ref="A3:C4"/></mergeCells></worksheet>''',
}

with ZipFile(Path(__file__).with_name('diagonal-external.xlsx'), 'w') as archive:
    for name, body in parts.items():
        entry = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, body)
