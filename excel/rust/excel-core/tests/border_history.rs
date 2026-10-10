//! 边框事务包含邻格共边，但不会扩大用户的选区或改写其它数据。
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    sheet::BorderPreset, BorderSpec, BorderStyle, CellAddress, CellRange, Workbook,
};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn pen(style: BorderStyle, color: &str) -> BorderSpec {
    BorderSpec {
        style,
        color: Some(color.into()),
    }
}

#[test]
fn one_undo_restores_all_neighbour_faces_and_redo_clears_them_again() {
    let mut wb = Workbook::new();
    let red = pen(BorderStyle::Thick, "#c00000");
    wb.set_cell_input(0, "C3", "42").unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .patch_range_borders(range("B2", "D4"), BorderPreset::All, red.clone())
        .unwrap();
    let before: Vec<_> = ["C3", "B3", "D3", "C2", "C4"]
        .iter()
        .map(|addr| wb.sheet(0).unwrap().get_format(addr))
        .collect();
    let mut history = WorkbookHistory::default();
    history
        .patch_range_borders(&mut wb, 0, range("C3", "C3"), BorderPreset::None, red)
        .unwrap();
    let after: Vec<_> = ["C3", "B3", "D3", "C2", "C4"]
        .iter()
        .map(|addr| wb.sheet(0).unwrap().get_format(addr))
        .collect();
    assert_ne!(before, after);
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut wb).unwrap());
    for (addr, expected) in ["C3", "B3", "D3", "C2", "C4"].iter().zip(before) {
        assert_eq!(wb.sheet(0).unwrap().get_format(addr), expected, "{addr}");
    }
    assert!(!history.undo(&mut wb).unwrap());
    assert!(history.redo(&mut wb).unwrap());
    for (addr, expected) in ["C3", "B3", "D3", "C2", "C4"].iter().zip(after) {
        assert_eq!(wb.sheet(0).unwrap().get_format(addr), expected, "{addr}");
    }
    assert_eq!(
        wb.get_cell("Sheet1", "C3"),
        einfach_core::Value::Number(42.0)
    );
}

#[test]
fn unchanged_border_does_not_create_history_or_discard_redo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    let red = pen(BorderStyle::Thin, "#c00000");
    for _ in 0..2 {
        history
            .patch_range_borders(
                &mut wb,
                0,
                range("A1", "A1"),
                BorderPreset::All,
                red.clone(),
            )
            .unwrap();
    }
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    history
        .patch_range_borders(&mut wb, 0, range("A1", "A1"), BorderPreset::None, red)
        .unwrap();
    assert_eq!(history.undo_count(), 0);
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn invalid_partial_merge_and_oversized_range_leave_data_and_history_untouched() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0)
        .unwrap()
        .restore_merged_ranges(vec![range("B2", "C3")])
        .unwrap();
    let mut history = WorkbookHistory::default();
    let red = pen(BorderStyle::Thin, "#c00000");
    for target in [range("A1", "B2"), range("A1", "A100001")] {
        assert!(history
            .patch_range_borders(&mut wb, 0, target, BorderPreset::All, red.clone())
            .is_err());
        assert_eq!(history.undo_count(), 0);
        assert_eq!(
            wb.sheet(0).unwrap().get_format("A1").borders,
            Default::default()
        );
    }
    // 失败不留下 pending 事务，之后合法操作可立即执行。
    history
        .patch_range_borders(&mut wb, 0, range("B2", "C3"), BorderPreset::Outside, red)
        .unwrap();
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn sheet_edges_never_expand_history_beyond_excel_limits() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    for addr in ["A1", "XFD1048576"] {
        history
            .patch_range_borders(
                &mut wb,
                0,
                range(addr, addr),
                BorderPreset::All,
                pen(BorderStyle::Thin, "#123abc"),
            )
            .unwrap();
        assert!(history.undo(&mut wb).unwrap());
        assert_eq!(
            wb.sheet(0).unwrap().get_format(addr).borders,
            Default::default()
        );
        assert!(history.redo(&mut wb).unwrap());
    }
}
