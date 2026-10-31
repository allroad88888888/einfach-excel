//! 仅可见单元格与当前区域：由原生工作表数据计算，不依赖视口。
use einfach_core::Value;
use einfach_excel_core::outline::{OutlineAction as Action, OutlineAxis as Axis};
use einfach_excel_core::workbook::SheetVisibility;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, MergeAction, Workbook};

fn at(a: &str) -> CellAddress {
    CellAddress::parse(a).unwrap()
}
fn rect(a: &str, b: &str) -> CellRange {
    CellRange::new(at(a), at(b))
}
fn region(book: &Workbook, a: &str) -> CellRange {
    book.current_region(0, at(a)).unwrap()
}
fn fill(book: &mut Workbook, from: &str, to: &str) {
    for addr in rect(from, to).iter() {
        book.set_cell(0, &addr.to_string(), Value::Number(1.0));
    }
}

#[test]
fn visible_blocks_skip_manual_filtered_and_collapsed_rows_plus_hidden_columns() {
    let mut book = Workbook::new();
    for row in 1..=8 {
        book.set_cell(0, &format!("A{row}"), Value::Text(if row % 2 == 0 { "no" } else { "yes" }.into()));
    }
    book.apply_filter(0, &[ColumnFilterRule::Equals {
        col_index: 0, value: "yes".into(), case_sensitive: false }]).unwrap();
    // 筛选隐藏第 2/4/6/8 行；再手动隐藏第 5 行，折叠第 7 行所在分组。
    book.hide_rows(0, &[4]);
    let mut history = WorkbookHistory::default();
    history.change_outline(&mut book, 0, Axis::Row, Action::Group { start: 6, end: 6 }).unwrap();
    history.change_outline(&mut book, 0, Axis::Row,
        Action::SetCollapsed { index: 0, collapsed: true }).unwrap();
    book.restore_sheet_visibility(0, &SheetVisibility { rows: vec![4], columns: vec![1] }).unwrap();
    let result = book.visible_blocks(0, &[rect("A1", "C8")], 100).unwrap();
    assert_eq!(result.blocks, vec![rect("A1", "A1"), rect("C1", "C1"), rect("A3", "A3"),
        rect("C3", "C3")]);
    assert_eq!(result.cell_count, 4);
}

#[test]
fn visible_blocks_of_an_unhidden_range_is_the_range_and_fully_hidden_is_empty() {
    let mut book = Workbook::new();
    let whole = rect("A1", "XFD1048576");
    let result = book.visible_blocks(0, &[whole], 10).unwrap();
    assert_eq!(result.blocks, vec![whole]);
    assert_eq!(result.cell_count, 1_048_576u64 * 16_384);
    book.hide_rows(0, &[0, 1]);
    assert!(book.visible_blocks(0, &[rect("A1", "D2")], 10).unwrap().blocks.is_empty());
}

#[test]
fn visible_blocks_rejects_budget_overflow_and_bad_ranges() {
    let mut book = Workbook::new();
    book.hide_rows(0, &[1, 3, 5]);
    assert!(book.visible_blocks(0, &[rect("A1", "A8")], 3).is_err());
    assert_eq!(book.visible_blocks(0, &[rect("A1", "A8")], 4).unwrap().blocks.len(), 4);
    assert!(book.visible_blocks(0, &[], 4).is_err());
    assert!(book.visible_blocks(9, &[rect("A1", "A2")], 4).is_err());
}

#[test]
fn current_region_stops_at_blank_rows_and_columns_and_includes_diagonals() {
    let mut book = Workbook::new();
    fill(&mut book, "B2", "D4");
    fill(&mut book, "H2", "I3");
    book.set_cell(0, "E5", Value::Number(1.0));
    assert_eq!(region(&book, "C3"), rect("B2", "E5"));
    assert_eq!(region(&book, "B2"), rect("B2", "E5"));
    // E5 只与 D4 对角相连，但仍属于同一块；H2:I3 与它隔着整列 F、G。
    assert_eq!(region(&book, "I3"), rect("H2", "I3"));
    // 孤立空格的当前区域就是它自己。
    assert_eq!(region(&book, "J10"), rect("J10", "J10"));
}

#[test]
fn current_region_follows_long_chains_and_staircases_to_the_real_extent() {
    let mut book = Workbook::new();
    fill(&mut book, "A1", "A5000");
    for i in 0..50u32 {
        book.set_cell(0, &CellAddress::new(4999 + i, 1 + i).to_string(), Value::Number(1.0));
    }
    assert_eq!(region(&book, "A2500"), CellRange::new(at("A1"), CellAddress::new(5048, 50)));
}

#[test]
fn current_region_covers_spill_ranges_and_non_empty_merged_cells() {
    let mut book = Workbook::new();
    book.set_formula(0, "B2", "=SEQUENCE(3,3)");
    book.set_cell(0, "A1", Value::Number(1.0));
    assert_eq!(region(&book, "C4"), rect("A1", "D4"));
    let mut merged = Workbook::new();
    merged.set_cell(0, "A1", Value::Number(1.0));
    merged.set_cell(0, "B2", Value::Number(2.0));
    merged.merge_cells(0, rect("B2", "C3"), MergeAction::Merge, true).unwrap();
    assert_eq!(region(&merged, "A1"), rect("A1", "C3"));
}
