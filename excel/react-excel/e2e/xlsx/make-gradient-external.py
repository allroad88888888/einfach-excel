"""Hand-authored SpreadsheetML gradients; independent of the product XLSX writer."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
rgb_stops = '<stop position="0"><color rgb="FFFF0000"/></stop><stop position="0.4"><color rgb="FF00FF00"/></stop><stop position="1"><color rgb="FF0000FF"/></stop>'
gradients = [
    f'<gradientFill degree="-45">{rgb_stops}</gradientFill>',
    '<gradientFill type="path" left="0.1" right="0.7" top="0.2" bottom="0.6"><stop position="0"><color theme="0" tint="-0.5"/></stop><stop position="0.4"><color indexed="4"/></stop><stop position="1"><color rgb="FFFF0000"/></stop></gradientFill>',
    '<gradientFill type="path"><stop position="0.3"><color rgb="FFABCDEF"/></stop></gradientFill>',
    '<gradientFill type="path" left="0.9" right="0.1" top="0.8" bottom="0.2"><stop position="1"><color rgb="FF0000FF"/></stop><stop position="0"><color rgb="FFFF0000"/></stop><stop position="0.5"><color rgb="FF00FF00"/></stop><stop position="0.5"><color rgb="FFFF00FF"/></stop></gradientFill>',
    '<gradientFill degree="720"/>',
    f'<gradientFill type="path" right="2">{rgb_stops}</gradientFill>',
]
fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
fills += [f'<fill>{body}</fill>' for body in gradients]
xfs = ['<xf fontId="0" fillId="0"/>']
xfs += [f'<xf fontId="0" fillId="{index}" applyFill="1"/>' for index in range(2, len(fills))]
xfs += ['<xf fontId="0" fillId="0" applyFill="1"/>']
parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': f'<workbook xmlns="{NS}" xmlns:r="{REL}"><sheets><sheet name="Gradients" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{REL}/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': f'<styleSheet xmlns="{NS}"><fonts count="1"><font><sz val="12"/><name val="Arial"/></font></fonts><fills count="{len(fills)}">{"".join(fills)}</fills><borders count="1"><border/></borders><cellXfs count="{len(xfs)}">{"".join(xfs)}</cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': f'<worksheet xmlns="{NS}"><sheetFormatPr defaultRowHeight="48" defaultColWidth="18"/><cols><col min="4" max="4" style="2"/></cols><sheetData>'
        + ''.join(f'<row r="{index}"><c r="A{index}" s="{index}"/></row>' for index in range(1, 7))
        + '<row r="7" s="1" customFormat="1"><c r="A7" s="7"/><c r="B7"/></row></sheetData></worksheet>',
}
with ZipFile(Path(__file__).with_name('gradient-external.xlsx'), 'w') as archive:
    for name, body in parts.items():
        entry = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, body)
