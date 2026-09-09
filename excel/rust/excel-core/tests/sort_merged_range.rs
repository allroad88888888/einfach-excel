//! 排序不得搬走合并格内容却留下原布局；拒绝前不得修改数据。
use einfach_core::Value;
use einfach_excel_core::sort::{SortDirection, SortKey, SortRangeError};
use einfach_excel_core::{CellAddress, CellRange, Sheet};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

#[test]
fn rejects_any_intersection_with_merged_cells_without_changing_content() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(2.0));
    sheet.set_cell("A3", Value::Number(1.0));
    sheet
        .restore_merged_ranges(vec![range("A1", "B2")])
        .unwrap();
    let key = SortKey {
        col: 0,
        direction: SortDirection::Ascending,
        case_sensitive: false,
    };
    for target in [range("A1", "B3"), range("A2", "A3")] {
        assert_eq!(
            sheet.sort_range(target, &[key], &[]),
            Err(SortRangeError::MergeIntersectsRange)
        );
        assert_eq!(sheet.get_cell("A1"), Value::Number(2.0));
        assert_eq!(sheet.get_cell("A3"), Value::Number(1.0));
        assert_eq!(sheet.merged_ranges(), &[range("A1", "B2")]);
    }
    sheet.set_cell("A4", Value::Number(0.0));
    assert_eq!(
        sheet
            .sort_range(range("A3", "A4"), &[key], &[])
            .unwrap()
            .moved_rows,
        2
    );
    assert_eq!(sheet.get_cell("A3"), Value::Number(0.0));
}
