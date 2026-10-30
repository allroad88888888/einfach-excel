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
