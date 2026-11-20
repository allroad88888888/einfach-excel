"""Hand-authored OOXML fixture covering icon sets, threaded comments, sheet protection,
row/column outlines, hidden sheet + tab color, and cell text rotation."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
TC_NS = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments'
TC_REL = 'http://schemas.microsoft.com/office/2017/10/relationships/threadedComment'
PERSON_REL = 'http://schemas.microsoft.com/office/2017/10/relationships/person'

parts = {
    '[Content_Types].xml': '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/persons/person.xml" ContentType="application/vnd.ms-excel.person+xml"/>
  <Override PartName="/xl/threadedComments/threadedComment1.xml" ContentType="application/vnd.ms-excel.threadedcomments+xml"/>
</Types>''',
    '_rels/.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="{NS}" xmlns:r="{REL}">
  <sheets>
    <sheet name="Dashboard" sheetId="1" r:id="rId1"/>
    <sheet name="Archived" sheetId="2" state="hidden" r:id="rId2"/>
  </sheets>
</workbook>''',
    'xl/_rels/workbook.xml.rels': f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="{REL}/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="{REL}/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="{REL}/styles" Target="styles.xml"/>
  <Relationship Id="rId4" Type="{PERSON_REL}" Target="persons/person.xml"/>
</Relationships>''',
    'xl/styles.xml': f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="{NS}">
  <fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyProtection="1"><protection locked="0"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment textRotation="45"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment textRotation="135"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment textRotation="255"/></xf>
  </cellXfs>
</styleSheet>''',
    'xl/persons/person.xml': f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<personList xmlns="{TC_NS}">
  <person displayName="Alice" id="{{11111111-1111-1111-1111-111111111111}}"/>
  <person displayName="Bob" id="{{22222222-2222-2222-2222-222222222222}}"/>
</personList>''',
    'xl/worksheets/sheet1.xml': f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="{NS}" xmlns:r="{REL}">
  <sheetPr><tabColor rgb="FFFF8800"/></sheetPr>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="21"/>
  <cols>
    <col min="2" max="3" width="12" customWidth="1" outlineLevel="1"/>
  </cols>
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>KPI</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Q1</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Q2</t></is></c>
      <c r="D1" t="inlineStr"><is><t>Review</t></is></c>
      <c r="E1" t="inlineStr"><is><t>Input</t></is></c>
      <c r="F1" s="2" t="inlineStr"><is><t>Up45</t></is></c>
      <c r="G1" s="3" t="inlineStr"><is><t>Down45</t></is></c>
      <c r="H1" s="4" t="inlineStr"><is><t>Vert</t></is></c>
    </row>
    <row r="2" outlineLevel="1">
      <c r="A2"><v>5</v></c>
      <c r="B2"><v>100</v></c>
      <c r="C2"><v>120</v></c>
      <c r="D2" s="1"><v>42</v></c>
      <c r="E2"><v>10</v></c>
    </row>
    <row r="3" outlineLevel="1">
      <c r="A3"><v>25</v></c>
      <c r="B3"><v>200</v></c>
      <c r="C3"><v>240</v></c>
      <c r="E3"><v>20</v></c>
    </row>
    <row r="4">
      <c r="A4"><v>80</v></c>
    </row>
  </sheetData>
  <sheetProtection sheet="1" objects="1" scenarios="1" sort="0" insertRows="0"/>
  <protectedRanges>
    <protectedRange name="InputRange" sqref="E2:E3"/>
  </protectedRanges>
  <conditionalFormatting sqref="A2:A4">
    <cfRule type="iconSet" priority="1">
      <iconSet iconSet="3Arrows" showValue="0" reverse="1">
        <cfvo type="percent" val="0"/>
        <cfvo type="num" val="15" gte="1"/>
        <cfvo type="num" val="50" gte="1"/>
      </iconSet>
    </cfRule>
  </conditionalFormatting>
</worksheet>''',
    'xl/worksheets/_rels/sheet1.xml.rels': f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdTc1" Type="{TC_REL}" Target="../threadedComments/threadedComment1.xml"/>
</Relationships>''',
    'xl/threadedComments/threadedComment1.xml': f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ThreadedComments xmlns="{TC_NS}">
  <threadedComment ref="D2" dT="2026-04-01T10:00:00.000Z" personId="{{11111111-1111-1111-1111-111111111111}}" id="{{aaaa}}" done="1">
    <text>@Bob Please check D2</text>
    <mentions><mention mentionpersonId="{{22222222-2222-2222-2222-222222222222}}" mentionId="{{m1}}" startIndex="0" length="4"/></mentions>
  </threadedComment>
  <threadedComment ref="D2" dT="2026-04-01T10:05:00.000Z" personId="{{22222222-2222-2222-2222-222222222222}}" id="{{bbbb}}" parentId="{{aaaa}}">
    <text>Looks good</text>
  </threadedComment>
</ThreadedComments>''',
    'xl/worksheets/sheet2.xml': f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="{NS}">
  <sheetPr><tabColor rgb="FF3366CC"/></sheetPr>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Secret archive</t></is></c></row></sheetData>
</worksheet>''',
}

with ZipFile(Path(__file__).with_name('fidelity-roundtrip.xlsx'), 'w') as archive:
    for name, body in parts.items():
        entry = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, body)
