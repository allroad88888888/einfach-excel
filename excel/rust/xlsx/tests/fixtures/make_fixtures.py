"""生成 XLSX 读取测试样本：python3 make_fixtures.py（需要 openpyxl）。"""
import datetime
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

wb = Workbook()
ws = wb.active
ws.title = "Orders"
ws.append(["Item", "Qty", "Price", "Total", "Paid", "Date"])
ws.append(["Apple & Pear <x>", 3, 1.25, "=B2*C2", True, datetime.date(2026, 10, 30)])
ws.append(["Banana", 7, 0.5, "=B3*C3", False, datetime.date(2026, 1, 2)])
ws["A5"] = "=SUM(D2:D3)"
ws["B5"] = "=Summary!A1&\"!\""
ws["C5"] = "=_xlfn.XLOOKUP(\"Banana\",A2:A3,B2:B3)"
ws["D5"] = "=1/0"
ws["A1"].font = Font(bold=True, italic=True, size=14, name="Arial", color="FFFF0000")
ws["B1"].fill = PatternFill("solid", fgColor="FF00FF00")
ws["C1"].border = Border(top=Side(style="thin", color="FF0000FF"), bottom=Side(style="double"))
ws["D1"].alignment = Alignment(horizontal="center", vertical="top", wrap_text=True, indent=2)
ws["C2"].number_format = "#,##0.00"
ws["E3"].number_format = "0.00%"
ws["F2"].number_format = "yyyy-mm-dd"
ws["F3"].number_format = "0.0\" kg\""
ws.merge_cells("A7:C8")
ws["A7"] = "Merged"
ws.freeze_panes = "B2"
ws.column_dimensions["A"].width = 20
ws.row_dimensions[2].height = 30

summary = wb.create_sheet("Summary")
summary["A1"] = "Done"
summary["B2"] = 42
wb.save("basic.xlsx")


# ---- features.xlsx：第二轮转换的功能（超链接、批注、名称、验证、条件格式、Table、隐藏行列）----
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, DataBarRule, FormulaRule, Rule
from openpyxl.styles.differential import DifferentialStyle
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo

wb = Workbook()
ws = wb.active
ws.title = "Data"
ws.append(["Name", "Qty", "Note", "Day"])
for i in range(2, 8):
    ws.append([f"item{i}", i * 10, f"x{i}", datetime.date(2026, 1, i)])
ws["A10"] = "Site"
ws["A10"].hyperlink = "https://example.com/a?b=1&c=2"
ws["A11"] = "Internal"
ws["A11"].hyperlink = "#Data!A1"
ws["B10"].comment = Comment("Check this <value>\nsecond line", "Ann")
wb.defined_names["Quantities"] = DefinedName("Quantities", attr_text="Data!$B$2:$B$7")
wb.defined_names["Computed"] = DefinedName("Computed", attr_text="SUM(Data!$B$2:$B$3)")
tab = Table(displayName="Sales", ref="A1:D7")
tab.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True, showFirstColumn=True)
ws.add_table(tab)
ws.row_dimensions[4].hidden = True
ws.row_dimensions[5].height = 30
ws.column_dimensions["C"].hidden = True
ws.column_dimensions["B"].width = 14

dv = DataValidation(type="list", formula1='"red,green,blue"', allow_blank=True)
dv.promptTitle, dv.prompt, dv.showInputMessage = "Pick", "Choose a colour", True
dv.errorTitle, dv.error, dv.errorStyle, dv.showErrorMessage = "Bad", "Not allowed", "warning", True
dv.add("F2:F6")
ws.add_data_validation(dv)
dv2 = DataValidation(type="whole", operator="greaterThan", formula1="5", allow_blank=False)
dv2.add("G2:G4")
ws.add_data_validation(dv2)
dv3 = DataValidation(type="decimal", operator="between", formula1="0.5", formula2="1.5", allow_blank=True)
dv3.add("H2")
ws.add_data_validation(dv3)
dv4 = DataValidation(type="date", operator="notBetween", formula1="46023", formula2="46387", allow_blank=True)
dv4.add("I2")
ws.add_data_validation(dv4)
dv5 = DataValidation(type="textLength", operator="lessThanOrEqual", formula1="9", allow_blank=True)
dv5.add("J2")
ws.add_data_validation(dv5)
dv6 = DataValidation(type="custom", formula1="LEN(K2)>2", allow_blank=True)
dv6.add("K2:K5")
ws.add_data_validation(dv6)
dv7 = DataValidation(type="time", operator="between", formula1="0.354166666666667", formula2="0.708333333333333")
dv7.add("L2")
ws.add_data_validation(dv7)

red = DifferentialStyle(font=Font(color="FF9C0006", bold=True), fill=PatternFill(bgColor="FFFFC7CE"))
ws.conditional_formatting.add("B2:B7", CellIsRule(operator="greaterThan", formula=["30"], font=Font(color="FFFF0000", bold=True), fill=PatternFill(bgColor="FFFFFF00")))
ws.conditional_formatting.add("B2:B7", CellIsRule(operator="between", formula=["20", "40"], fill=PatternFill(bgColor="FFC6EFCE")))
ws.conditional_formatting.add("A2:A7", FormulaRule(formula=["$B2>40"], font=Font(italic=True)))
ws.conditional_formatting.add("C2:C7", Rule(type="containsText", operator="containsText", text="x", dxf=red, formula=['NOT(ISERROR(SEARCH("x",C2)))']))
ws.conditional_formatting.add("C2:C7", Rule(type="beginsWith", operator="beginsWith", text="x", dxf=red, formula=['LEFT(C2,LEN("x"))="x"']))
ws.conditional_formatting.add("C2:C7", Rule(type="endsWith", operator="endsWith", text="9", dxf=red, formula=['RIGHT(C2,LEN("9"))="9"']))
ws.conditional_formatting.add("D2:D7", Rule(type="duplicateValues", dxf=red))
ws.conditional_formatting.add("D2:D7", Rule(type="uniqueValues", dxf=red))
ws.conditional_formatting.add("B2:B7", Rule(type="top10", rank=2, percent=True, bottom=True, dxf=red))
ws.conditional_formatting.add("E2:E7", ColorScaleRule(start_type="min", start_color="FFF8696B", mid_type="percentile", mid_value=50, mid_color="FFFFEB84", end_type="max", end_color="FF63BE7B"))
ws.conditional_formatting.add("M2:M7", DataBarRule(start_type="min", end_type="max", color="FF638EC6"))

other = wb.create_sheet("Other Sheet")
other["A1"] = "Target"
other["B2"] = 5
wb.defined_names["Other"] = DefinedName("Other", attr_text="'Other Sheet'!$B$2")
wb.save("features.xlsx")
