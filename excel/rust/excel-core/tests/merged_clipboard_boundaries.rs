//! 合并剪贴板几何未实现前，旧粘贴事务不能向覆盖格偷偷写入或只搬走锚点。
use einfach_core::Value;
use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot};
use einfach_excel_core::{CellAddress, CellRange, MergeAction, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}

#[test]
fn paste_rejects_covered_cells_before_overwriting_the_anchor() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Keep".into()));
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Merge, false).unwrap();
    let source = ClipboardSnapshot::from_tsv("Replace\tHidden", ClipboardPasteMode::All).unwrap();
    assert!(wb.paste_clipboard(&source, 0, &ClipboardPasteOptions::new(range("A1", "A1"))).is_err());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Keep".into()));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
}

#[test]
fn stale_cut_cannot_leave_a_merge_behind_and_single_anchor_paste_remains_valid() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(4.0));
    let cut = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    wb.merge_cells(0, range("A1", "B2"), MergeAction::Merge, false).unwrap();
    assert!(wb.capture_clipboard(0, range("A1", "B2"), true).is_err());
    assert!(wb.paste_clipboard(&cut, 0, &ClipboardPasteOptions::new(range("D1", "D1"))).is_err());
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Null);
    let value = ClipboardSnapshot::from_tsv("8", ClipboardPasteMode::All).unwrap();
    wb.paste_clipboard(&value, 0, &ClipboardPasteOptions::new(range("A1", "A1"))).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(8.0));
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range("A1", "B2")]);
}
