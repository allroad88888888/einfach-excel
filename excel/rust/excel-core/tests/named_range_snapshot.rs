//! 名称快照只恢复范围定义，拒绝必须原子，不能覆盖常量／LAMBDA。
use einfach_core::Value;
use einfach_excel_core::workbook::NamedRangeSnapshot;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

#[test]
fn replacing_range_snapshot_keeps_unrelated_constants_and_rebinds_sheet_keys() {
    let mut source = Workbook::new();
    source.add_sheet("Source");
    source.remove_sheet(0).unwrap();
    source
        .define_named_range("Sales", 0, CellRange::single(CellAddress::new(0, 0)))
        .unwrap();
    let snapshot = source.snapshot_named_ranges();
    let mut restored = Workbook::new();
    restored.set_cell(0, "A1", Value::Number(42.0));
    restored
        .define_name_value("Keep", Value::Number(7.0))
        .unwrap();
    restored.restore_named_ranges(snapshot).unwrap();
    restored.set_formula(0, "C1", "=SUM(Sales)+Keep");
    assert_eq!(restored.get_cell("Sheet1", "C1"), Value::Number(49.0));
    restored.restore_named_ranges(vec![]).unwrap();
    assert_eq!(restored.get_named("Keep"), Some(Value::Number(7.0)));
    assert!(restored.named_range("Sales").unwrap().is_none());
}

#[test]
fn rejected_restore_keeps_all_existing_names() {
    let mut wb = Workbook::new();
    let range = CellRange::single(CellAddress::new(0, 0));
    wb.define_named_range("Sales", 0, range).unwrap();
    wb.define_name_value("Keep", Value::Number(7.0)).unwrap();
    let before = wb.snapshot_named_ranges();
    let first = NamedRangeSnapshot {
        name: "NewSales".into(),
        target: Some((0, range)),
    };
    for bad in [
        NamedRangeSnapshot {
            name: "Keep".into(),
            target: None,
        },
        NamedRangeSnapshot {
            name: "NewSales".into(),
            target: None,
        },
        NamedRangeSnapshot {
            name: "BadRange".into(),
            target: Some((99, range)),
        },
    ] {
        assert!(wb.restore_named_ranges(vec![first.clone(), bad]).is_err());
        assert_eq!(wb.snapshot_named_ranges(), before);
        assert_eq!(wb.get_named("Keep"), Some(Value::Number(7.0)));
    }
}
