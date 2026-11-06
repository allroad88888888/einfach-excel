#!/usr/bin/env python3
"""生成 chartex_excel_style.xlsx：手写的「Excel 风格」chartEx 最小样例（不依赖 openpyxl，它不会写 chartEx）。

结构照 Excel 2016+ 保存的 chartEx 写：drawing 里 mc:AlternateContent 包 graphicFrame，
drawing rels 的类型是 .../2014/relationships/chartEx，部件是 xl/charts/chartEx1.xml，
内容类型 application/vnd.ms-office.chartex+xml；系列带 uniqueId、数据标签带 visibility、
轴带 numFmt / txPr 等导入端应当容忍的额外元素；直方图额外带一条 paretoLine 系列（导入忽略）。

Sheet1 数据：
  A1:B6  瀑布图：Start / Up / Down / Total / End 与数值。Excel 把下标 0 和 4 标成汇总，
         而 Total 在下标 3 —— 与插件按类别名认出的汇总柱对不上，导入要记「瀑布图汇总柱」。
  D1:D7  直方图的原始数值（D1 是表头）。
  F1:F2  漏斗图，字面量缓存、无 cx:f（导入应跳过整张图并计入 charts）。

运行：python3 make_chartex_fixtures.py   （在本目录生成 chartex_excel_style.xlsx）
"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))

CX = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"'


def lvl(values, fmt=False):
    pts = "".join(f'<cx:pt idx="{i}">{v}</cx:pt>' for i, v in enumerate(values))
    f = ' formatCode="General"' if fmt else ""
    return f'<cx:lvl ptCount="{len(values)}"{f}>{pts}</cx:lvl>'


WATERFALL = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cx:chartSpace {CX}><cx:chartData><cx:data id="0">
<cx:strDim type="cat"><cx:f>Sheet1!$A$2:$A$6</cx:f>{lvl(["Start", "Up", "Down", "Total", "End"])}</cx:strDim>
<cx:numDim type="val"><cx:f>Sheet1!$B$2:$B$6</cx:f>{lvl([100, 30, -20, 110, 110], True)}</cx:numDim>
</cx:data></cx:chartData>
<cx:chart><cx:title pos="t" align="ctr" overlay="0"><cx:tx><cx:txData><cx:v>Excel waterfall</cx:v></cx:txData></cx:tx></cx:title>
<cx:plotArea><cx:plotAreaRegion>
<cx:series layoutId="waterfall" uniqueId="{{6E3B6F5C-7D5B-4B7E-9A55-0D1D5E1F0001}}">
<cx:tx><cx:txData><cx:f>Sheet1!$B$1</cx:f><cx:v>Amount</cx:v></cx:txData></cx:tx>
<cx:dataLabels pos="outEnd"><cx:visibility seriesName="0" categoryName="0" value="1"/></cx:dataLabels>
<cx:dataId val="0"/><cx:layoutPr><cx:subtotals><cx:idx val="0"/><cx:idx val="4"/></cx:subtotals></cx:layoutPr><cx:axisId val="1"/>
</cx:series></cx:plotAreaRegion>
<cx:axis id="0"><cx:catScaling gapWidth="0.5"/><cx:tickLabels/></cx:axis>
<cx:axis id="1"><cx:valScaling/><cx:majorGridlines/><cx:tickLabels/><cx:numFmt formatCode="General" sourceLinked="1"/></cx:axis>
</cx:plotArea><cx:legend pos="b" align="ctr" overlay="0"/></cx:chart></cx:chartSpace>"""

HISTOGRAM = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cx:chartSpace {CX}><cx:chartData><cx:data id="0">
<cx:numDim type="val"><cx:f>Sheet1!$D$2:$D$7</cx:f>{lvl([1, 2, 2, 3, 3, 9], True)}</cx:numDim>
</cx:data></cx:chartData>
<cx:chart><cx:plotArea><cx:plotAreaRegion>
<cx:series layoutId="clusteredColumn" uniqueId="{{6E3B6F5C-7D5B-4B7E-9A55-0D1D5E1F0002}}">
<cx:tx><cx:txData><cx:f>Sheet1!$D$1</cx:f><cx:v>Score</cx:v></cx:txData></cx:tx>
<cx:dataId val="0"/><cx:layoutPr><cx:binning intervalClosed="r"/></cx:layoutPr><cx:axisId val="1"/></cx:series>
<cx:series layoutId="paretoLine" ownerIdx="0" uniqueId="{{6E3B6F5C-7D5B-4B7E-9A55-0D1D5E1F0003}}"><cx:axisId val="2"/></cx:series>
</cx:plotAreaRegion>
<cx:axis id="0"><cx:catScaling gapWidth="0"/><cx:tickLabels/></cx:axis>
<cx:axis id="1"><cx:valScaling/><cx:majorGridlines/><cx:tickLabels/></cx:axis>
</cx:plotArea></cx:chart></cx:chartSpace>"""

LITERAL_FUNNEL = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cx:chartSpace {CX}><cx:chartData><cx:data id="0">
<cx:strDim type="cat">{lvl(["Visit", "Buy"])}</cx:strDim>
<cx:numDim type="val">{lvl([10, 4], True)}</cx:numDim>
</cx:data></cx:chartData>
<cx:chart><cx:plotArea><cx:plotAreaRegion><cx:series layoutId="funnel"><cx:dataId val="0"/></cx:series></cx:plotAreaRegion></cx:plotArea></cx:chart></cx:chartSpace>"""


def corner(tag, col, row):
    return f"<xdr:{tag}><xdr:col>{col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:{tag}>"


def anchor(shape_id, name, rel, col, row):
    return f"""<xdr:twoCellAnchor editAs="oneCell">{corner("from", col, row)}{corner("to", col + 6, row + 14)}
<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:cx1="http://schemas.microsoft.com/office/drawing/2015/9/8/chartex" Requires="cx1">
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="{shape_id}" name="{name}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2014/chartex"><cx:chart xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" r:id="{rel}"/></a:graphicData></a:graphic></xdr:graphicFrame></mc:Choice>
<mc:Fallback><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="0" name=""/><xdr:cNvSpPr><a:spLocks noTextEdit="1"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="2743200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr><xdr:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>chartEx</a:t></a:r></a:p></xdr:txBody></xdr:sp></mc:Fallback></mc:AlternateContent><xdr:clientData/></xdr:twoCellAnchor>"""


DRAWING = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
           + anchor(2, "wf", "rId1", 7, 0) + anchor(3, "hist", "rId2", 7, 16) + anchor(4, "lit", "rId3", 7, 32) + "</xdr:wsDr>")

CHARTEX_REL = "http://schemas.microsoft.com/office/2014/relationships/chartEx"
DRAWING_RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + "".join(f'<Relationship Id="rId{i}" Type="{CHARTEX_REL}" Target="../charts/chartEx{i}.xml"/>' for i in (1, 2, 3)) + "</Relationships>")


def cells():
    rows = [("Item", "Amount", None, "Score"), ("Start", 100, None, 1), ("Up", 30, None, 2), ("Down", -20, None, 2),
            ("Total", 110, None, 3), ("End", 110, None, 3), (None, None, None, 9)]
    xml = ""
    for r, row in enumerate(rows, 1):
        body = ""
        for c, v in enumerate(row):
            if v is None:
                continue
            ref = "ABCD"[c] + str(r)
            body += f'<c r="{ref}" t="inlineStr"><is><t>{v}</t></is></c>' if isinstance(v, str) else f'<c r="{ref}"><v>{v}</v></c>'
        xml += f'<row r="{r}">{body}</row>'
    return xml


SHEET = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
         f'<sheetData>{cells()}</sheetData><drawing r:id="rId1"/></worksheet>')

PARTS = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
    + "".join(f'<Override PartName="/xl/charts/chartEx{i}.xml" ContentType="application/vnd.ms-office.chartex+xml"/>' for i in (1, 2, 3)) + "</Types>",
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": SHEET,
    "xl/worksheets/_rels/sheet1.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
    "xl/drawings/drawing1.xml": DRAWING,
    "xl/drawings/_rels/drawing1.xml.rels": DRAWING_RELS,
    "xl/charts/chartEx1.xml": WATERFALL,
    "xl/charts/chartEx2.xml": HISTOGRAM,
    "xl/charts/chartEx3.xml": LITERAL_FUNNEL,
}

if __name__ == "__main__":
    with zipfile.ZipFile(os.path.join(HERE, "chartex_excel_style.xlsx"), "w", zipfile.ZIP_DEFLATED) as z:
        for name, body in PARTS.items():
            z.writestr(name, body)
