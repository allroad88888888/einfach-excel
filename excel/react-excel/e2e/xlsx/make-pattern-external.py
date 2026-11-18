"""Hand-authored pattern colors and explicit axis overrides; no product serializer."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PATTERNS = ['mediumGray', 'darkGray', 'lightGray', 'darkHorizontal', 'darkVertical',
            'darkDown', 'darkUp', 'darkGrid', 'darkTrellis', 'lightHorizontal',
            'lightVertical', 'lightDown', 'lightUp', 'lightGrid', 'lightTrellis',
            'gray125', 'gray0625']
fills = ['<fill><patternFill patternType="none"/></fill>',
         '<fill><patternFill patternType="gray125"/></fill>']
fills += [f'<fill><patternFill patternType="{p}"><fgColor rgb="FFC00000"/>'
          '<bgColor rgb="FFFFF2CC"/></patternFill></fill>' for p in PATTERNS]
fills += ['<fill><patternFill patternType="lightUp"><fgColor indexed="4"/><bgColor theme="0" tint="-0.5"/></patternFill></fill>',
          '<fill><patternFill patternType="futurePattern"><fgColor rgb="FF00FF00"/></patternFill></fill>',
          '<fill><gradientFill><stop position="0"><color rgb="FFFF0000"/></stop></gradientFill></fill>']
xfs = ['<xf fontId="0" fillId="0"/>']
xfs += [f'<xf fontId="0" fillId="{i}" applyFill="1"/>' for i in range(2, len(fills))]
xfs += ['<xf fontId="0" fillId="0" applyFill="1"/>',
        '<xf fontId="0" fillId="2" applyFill="0"/>']
parts = {
    '[Content_Types].xml': '''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>''',
    '_rels/.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': f'<workbook xmlns="{NS}" xmlns:r="{REL}"><sheets><sheet name="Patterns" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{REL}/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': f'''<styleSheet xmlns="{NS}">
      <fonts count="1"><font><sz val="12"/><name val="Arial"/></font></fonts>
      <fills count="{len(fills)}">{''.join(fills)}</fills><borders count="1"><border/></borders>
      <cellXfs count="{len(xfs)}">{''.join(xfs)}</cellXfs>
      <dxfs count="1"><dxf><font><b/></font><fill><patternFill patternType="darkGrid"><fgColor rgb="FFFF0000"/><bgColor rgb="FF00FF00"/></patternFill></fill></dxf></dxfs>
    </styleSheet>''',
    'xl/worksheets/sheet1.xml': f'''<worksheet xmlns="{NS}">
      <sheetFormatPr defaultRowHeight="32" defaultColWidth="18"/>
      <cols><col min="4" max="4" style="7"/></cols><sheetData>
      {''.join(f'<row r="{i+1}"><c r="A{i+1}" s="{i+1}" t="inlineStr"><is><t>{p}</t></is></c></row>' for i, p in enumerate(PATTERNS))}
      <row r="19" s="1" customFormat="1"><c r="A19" s="21"/><c r="B19"/><c r="C19" s="22"/></row>
      <row r="20"><c r="A20" s="18"/><c r="B20" s="19"/><c r="C20" s="20"/></row>
      </sheetData><conditionalFormatting sqref="A1"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>0</formula></cfRule></conditionalFormatting>
    </worksheet>''',
}
with ZipFile(Path(__file__).with_name('pattern-external.xlsx'), 'w') as archive:
    for name, body in parts.items():
        entry = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, body)
