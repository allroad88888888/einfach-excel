"""生成 XLSX 图表导入样本 charts.xlsx：python3 make_chart_fixtures.py（需要 openpyxl 3.1.x 与 Pillow）。

openpyxl 与 Excel 不同的地方，以 Excel 语义为准：
- 工作表名在公式里总是带单引号（'Main'!$B$2），Excel 只在需要时才加；导入两种写法都要认。
- `add_chart(chart, "F20")` 写 oneCellAnchor（宽高取 chart.width / height，单位厘米）；Excel 自己存的是 twoCellAnchor。
- 图形名 openpyxl 写 "Chart 1"（含空格，不是合法对象 id），Excel 同样；这里手工改出一个合法名和一个重名，验证 id 规则。
- openpyxl 不写 chartSpace 的字号，后处理里补一段 txPr（Excel 写在 chartSpace 末尾）。
- openpyxl 造不出字面量数据和外部工作簿引用，后处理里直接改 chart 部件的 XML。
行高列宽全部显式设置（列 13 字符 = 96px，行 15pt = 20px），锚点像素才可预期。
"""
import io
import re
import zipfile
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import (AreaChart, BarChart, DoughnutChart, LineChart, PieChart, RadarChart,
                            Reference, ScatterChart, Series)
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.marker import DataPoint
from openpyxl.chart.series import SeriesLabel
from openpyxl.comments import Comment
from openpyxl.drawing.image import Image
from openpyxl.drawing.spreadsheet_drawing import AbsoluteAnchor, AnchorMarker, TwoCellAnchor
from openpyxl.drawing.xdr import XDRPoint2D, XDRPositiveSize2D
from openpyxl.utils.units import pixels_to_EMU
from PIL import Image as PilImage

HERE = Path(__file__).parent


def size_grid(ws):
    for col in range(1, 27):
        ws.column_dimensions[ws.cell(1, col).column_letter].width = 13
    for row in range(1, 61):
        ws.row_dimensions[row].height = 15


def style_axes(chart):
    # openpyxl 3.1 默认把坐标轴写成 delete=None，部分查看器会隐藏；显式打开。
    for axis in (getattr(chart, "x_axis", None), getattr(chart, "y_axis", None)):
        if axis is not None:
            axis.delete = False


wb = Workbook()
main = wb.active
main.title = "Main"
sales = wb.create_sheet("Sales data")
shapes = wb.create_sheet("Shapes")
bad = wb.create_sheet("Unsupported")
for sheet in (main, sales, shapes, bad):
    size_grid(sheet)

for row in [["Region", "Q1", "Q2", "Q3"], ["North", 10, 20, 30], ["South", 15, 25, 35],
            ["East", 12, 22, 32], ["West", 18, 28, 38]]:
    main.append(row)
main["A1"].comment = Comment("header note", "tester")  # 批注（legacyDrawing）与图表 drawing 并存

for row in [["Month", "Online", "Store", "x", "Returns"], ["Jan", 5, 7, 1, 1], ["Feb", 6, 8, 2, 2],
            ["Mar", 7, 9, 3, 1], ["Apr", 8, 10, 4, 3]]:
    sales.append(row)
for row in [["Month", "Sales", "Cost"], ["Jan", 5, 3], ["Feb", 6, 4], ["Mar", 8, 4], ["Apr", 7, 5]]:
    shapes.append(row)
for row in [["Skill", "A", "B"], ["x", 1, 2], ["y", 3, 4], ["z", 5, 6]]:
    bad.append(row)


def columns(ws, chart, first_col, last_col, first_row=1, last_row=5, cats_col=1):
    chart.add_data(Reference(ws, min_col=first_col, min_row=first_row, max_col=last_col, max_row=last_row),
                   titles_from_data=True)
    chart.set_categories(Reference(ws, min_col=cats_col, min_row=first_row + 1, max_row=last_row))


# 1. Main：簇状柱形，两格锚点 F2:L17（6 列 x 15 行 = 576x300px），带全部元素
c1 = BarChart()
c1.type, c1.grouping = "col", "clustered"
columns(main, c1, 2, 3)
c1.title = "Region sales"
c1.legend.position = "b"
c1.x_axis.title, c1.y_axis.title = "Region", "Units"
c1.y_axis.scaling.min, c1.y_axis.scaling.max = 0, 100
c1.y_axis.majorGridlines = None
c1.dataLabels = DataLabelList()
c1.dataLabels.showVal = True
c1.display_blanks = "span"
c1.visible_cells_only = False
c1.series[0].graphicalProperties.solidFill = "FF0000"
c1.series[1].graphicalProperties.solidFill = "0000FF"
style_axes(c1)
anchor = TwoCellAnchor(editAs="oneCell")
anchor._from = AnchorMarker(col=5, row=1)
anchor.to = AnchorMarker(col=11, row=16)
c1.anchor = anchor
main.add_chart(c1)

# 2. Main：堆积柱形，oneCellAnchor F20，12x6 cm
c2 = BarChart()
c2.type, c2.grouping, c2.overlap = "col", "stacked", 100
columns(main, c2, 2, 4)
c2.width, c2.height = 12, 6
style_axes(c2)
main.add_chart(c2, "F20")

# 3. Main：百分比堆积条形（横向），absoluteAnchor x=970 y=430 400x240px，无图例
c3 = BarChart()
c3.type, c3.grouping, c3.overlap = "bar", "percentStacked", 100
columns(main, c3, 2, 3)
c3.legend = None
style_axes(c3)
c3.anchor = AbsoluteAnchor(pos=XDRPoint2D(pixels_to_EMU(970), pixels_to_EMU(430)),
                           ext=XDRPositiveSize2D(pixels_to_EMU(400), pixels_to_EMU(240)))
main.add_chart(c3)

# 4. Main：数据在 'Sales data'（带空格的表名要加引号）
c4 = BarChart()
columns(sales, c4, 2, 3)
c4.title = "Cross sheet"
style_axes(c4)
main.add_chart(c4, "N2")

# 5. Main：按行的系列（两行数据，名字在首列，类别在首行）
c5 = LineChart()
c5.add_data(Reference(main, min_col=1, min_row=2, max_col=4, max_row=3), from_rows=True, titles_from_data=True)
c5.set_categories(Reference(main, min_col=2, min_row=1, max_col=4, max_row=1))
c5.title = "By rows"
style_axes(c5)
main.add_chart(c5, "N20")

# 6. Main：系列不相邻（Online 在 B，Returns 在 E），类别在 A
c6 = BarChart()
for col in (2, 5):
    c6.series.append(Series(Reference(sales, min_col=col, min_row=1, max_row=5), title_from_data=True))
c6.set_categories(Reference(sales, min_col=1, min_row=2, max_row=5))
c6.title = "Gaps"
style_axes(c6)
main.add_chart(c6, "V2")

# Shapes
line = LineChart()
columns(shapes, line, 2, 3)
line.title = "Trend"
style_axes(line)
shapes.add_chart(line, "F2")

area = AreaChart()
area.grouping = "percentStacked"
columns(shapes, area, 2, 3)
style_axes(area)
shapes.add_chart(area, "F20")

pie = PieChart()
pie.add_data(Reference(shapes, min_col=2, min_row=1, max_row=5), titles_from_data=True)
pie.set_categories(Reference(shapes, min_col=1, min_row=2, max_row=5))
for index, color in ((0, "FF9900"), (2, "00AA00")):
    point = DataPoint(idx=index)
    point.graphicalProperties.solidFill = color
    pie.series[0].dPt.append(point)
shapes.add_chart(pie, "N2")

ring = DoughnutChart()
ring.add_data(Reference(shapes, min_col=3, min_row=1, max_row=5), titles_from_data=True)
ring.set_categories(Reference(shapes, min_col=1, min_row=2, max_row=5))
shapes.add_chart(ring, "N20")

scatter = ScatterChart()
scatter.style = 13
scatter.series.append(Series(Reference(sales, min_col=3, min_row=1, max_row=5),
                             Reference(sales, min_col=4, min_row=2, max_row=5), title_from_data=True))
scatter.title = "Scatter"
style_axes(scatter)
shapes.add_chart(scatter, "V2")

# 组合：柱（Sales，主轴）+ 线（Cost，次轴，valAx crosses=max）
combo = BarChart()
columns(shapes, combo, 2, 2)
extra = LineChart()
extra.add_data(Reference(shapes, min_col=3, min_row=1, max_row=5), titles_from_data=True)
extra.y_axis.axId = 200
extra.y_axis.crosses = "max"
style_axes(combo)
combo += extra
shapes.add_chart(combo, "V20")

# 系列名是字面量（c:tx/c:v）→ 名字丢掉并报告
literal_name = BarChart()
values = Series(Reference(shapes, min_col=2, min_row=2, max_row=5), title="Fixed name")
literal_name.series.append(values)
literal_name.set_categories(Reference(shapes, min_col=1, min_row=2, max_row=5))
literal_name.title = "Literal name"
style_axes(literal_name)
shapes.add_chart(literal_name, "AD2")

PilImage.new("RGB", (40, 30), "red").save(HERE / "_red.png")
shapes.add_image(Image(str(HERE / "_red.png")), "AD20")

# Unsupported：雷达图、字面量数据、外部工作簿引用
radar = RadarChart()
columns(bad, radar, 2, 3, 1, 4)
radar.title = "Radar"
bad.add_chart(radar, "F2")

literal = BarChart()
columns(bad, literal, 2, 2, 1, 4)
literal.title = "Literal data"
style_axes(literal)
bad.add_chart(literal, "F20")

external = BarChart()
columns(bad, external, 3, 3, 1, 4)
external.title = "External data"
style_axes(external)
bad.add_chart(external, "N2")

buffer = io.BytesIO()
wb.save(buffer)
(HERE / "_red.png").unlink()


def patch_chart(xml):
    # openpyxl 写默认命名空间（<chartSpace>），Excel 写 c: 前缀；读取只认本地名，所以两种都行。
    if "<a:t>Region sales</a:t>" in xml:
        font = '<txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></txPr>'
        xml = xml.replace("</chartSpace>", font + "</chartSpace>")
    if "<a:t>Literal data</a:t>" in xml:
        lit = '<val><numLit><ptCount val="2"/><pt idx="0"><v>1</v></pt><pt idx="1"><v>2</v></pt></numLit></val>'
        xml = re.sub(r"<val>.*?</val>", lit, xml, flags=re.S)
    if "<a:t>External data</a:t>" in xml:
        xml = re.sub(r"(<val><numRef><f>)[^<]*", r"\1[1]Sheet1!$C$2:$C$4", xml)
    return xml


def patch_drawing(xml):
    # Main 的 drawing：第 1 张图改成合法名，第 3 张图重名（重名的回落到 chart-N）。
    if 'name="Chart 1"' in xml and "Chart 6" in xml:
        xml = xml.replace('name="Chart 1"', 'name="sales_col"').replace('name="Chart 3"', 'name="sales_col"')
    return xml


with zipfile.ZipFile(io.BytesIO(buffer.getvalue())) as source, \
        zipfile.ZipFile(HERE / "charts.xlsx", "w", zipfile.ZIP_DEFLATED) as target:
    for item in source.infolist():
        data = source.read(item.filename)
        if re.match(r"xl/charts/chart\d+\.xml", item.filename):
            data = patch_chart(data.decode("utf-8")).encode("utf-8")
        elif re.match(r"xl/drawings/drawing\d+\.xml", item.filename):
            data = patch_drawing(data.decode("utf-8")).encode("utf-8")
        target.writestr(item, data)
print("wrote", HERE / "charts.xlsx")
