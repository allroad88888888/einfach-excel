//! 名称事务的数组投影必须在任意表顺序下完成，监听只看到最终结果。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook::NamedRangeAction as Action;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use std::cell::Cell;
use std::rc::Rc;

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.add_sheet("Source");
    wb.set_cell(1, "A1", Value::Number(10.0));
    wb.set_cell(1, "A2", Value::Number(20.0));
    wb.set_cell(1, "A5", Value::Number(50.0));
    wb.define_named_range(
        "Sales",
        1,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0)),
    )
    .unwrap();
    wb.set_formula(1, "C10", "=Sales");
    // 下游在源表之前，且在源锚点之前；不能靠表顺序或行主序碰巧算对。
    wb.set_formula(0, "A1", "=Source!C10#*2");
    wb.set_formula(0, "D1", "=A1#*2");
    wb
}

#[test]
fn range_resize_and_rename_settle_reverse_order_cross_sheet_spill_chains() {
    for new_name in ["Sales", "NewSales"] {
        let mut wb = seed();
        let mut history = WorkbookHistory::default();
        assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(80.0));
        history
            .change_named_range(
                &mut wb,
                0,
                Action::Update {
                    name: "Sales".into(),
                    new_name: new_name.into(),
                    target: Some((1, CellRange::single(CellAddress::new(4, 0)))),
                },
            )
            .unwrap();
        for _ in 0..3 {
            assert_eq!(wb.get_cell("Source", "C10"), Value::Number(50.0));
            for addr in ["A1", "D1"] {
                assert_eq!(
                    wb.get_cell("Sheet1", addr),
                    Value::Error(ValueError::InvalidRef),
                    "{new_name}: {addr}"
                );
            }
            for addr in ["A2", "D2"] {
                assert_eq!(
                    wb.get_cell("Sheet1", addr),
                    Value::Null,
                    "{new_name}: {addr}"
                );
            }
            history.undo(&mut wb).unwrap();
            assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(40.0));
            assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(80.0));
            history.redo(&mut wb).unwrap();
        }
    }
}

#[test]
fn cross_sheet_subscribers_receive_one_final_value_per_name_command() {
    let mut wb = seed();
    wb.set_formula(0, "G1", "=SUM(Sales)");
    let changes = Rc::new(Cell::new(0));
    let target = Rc::clone(&changes);
    let token = wb.sheet_mut(0).unwrap().subscribe_cell("G1", move || {
        target.set(target.get() + 1);
    });
    changes.set(0);
    let mut history = WorkbookHistory::default();
    history
        .change_named_range(
            &mut wb,
            1,
            Action::Update {
                name: "Sales".into(),
                new_name: "NewSales".into(),
                target: Some((1, CellRange::single(CellAddress::new(4, 0)))),
            },
        )
        .unwrap();
    assert_eq!(changes.get(), 1);
    assert_eq!(wb.get_cell("Sheet1", "G1"), Value::Number(50.0));
    changes.set(0);
    history.undo(&mut wb).unwrap();
    assert_eq!(changes.get(), 1);
    assert_eq!(wb.get_cell("Sheet1", "G1"), Value::Number(30.0));
    wb.sheet_mut(0).unwrap().unsubscribe_cell(token);
}

#[test]
fn single_cell_history_input_reprojects_named_arrays_and_their_consumers() {
    for in_table in [false, true] {
        let mut wb = seed();
        if in_table {
            // 数值编辑走 Table 单格分支，不建立或更新计算列。
            wb.define_table(Some("Orders"), 1,
                CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 0)), true).unwrap();
        }
        let mut history = WorkbookHistory::default();
        history.set_cell_input(&mut wb, 1, "A2", "40").unwrap();
        for redo in [false, true] {
            if redo { history.redo(&mut wb).unwrap(); }
            assert_eq!(wb.get_cell("Source", "C11"), Value::Number(40.0), "table={in_table}");
            assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(80.0));
            assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(160.0));
            history.undo(&mut wb).unwrap();
            assert_eq!(wb.get_cell("Source", "C11"), Value::Number(20.0));
            assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(80.0));
        }
    }
}
