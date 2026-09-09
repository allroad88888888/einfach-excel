//! 数组公式变成普通值或错误后，展示不能残留旧投影。
use einfach_core::{Value, ValueError};
use einfach_excel_core::Sheet;

#[test]
fn deleted_sequence_input_replaces_the_previous_spill_with_ref_error() {
    for blocked in [false, true] {
        for delete_column in [false, true] {
            let mut sheet = Sheet::new();
            sheet.set_cell("B1", Value::Number(472.0));
            if blocked {
                sheet.set_cell("C6", Value::Number(99.0));
            }
            sheet.set_formula("C5", "=SEQUENCE(3,1,B1)");
            if blocked {
                assert_eq!(sheet.get_cell("C5"), Value::Error(ValueError::Spill));
            } else {
                assert!(matches!(sheet.get_cell("C5"), Value::Array(_)));
                assert_eq!(sheet.get_cell("C6"), Value::Number(473.0));
            }

            let (anchor, target, tail) = if delete_column {
                sheet.delete_col(1, 1);
                ("B5", "B6", "B7")
            } else {
                sheet.delete_row(0, 1);
                ("C4", "C5", "C6")
            };

            assert_eq!(
                sheet.get_formula(anchor).as_deref(),
                Some("=SEQUENCE(3,1,#REF!)")
            );
            assert_eq!(sheet.get_cell(anchor), Value::Error(ValueError::InvalidRef));
            assert_eq!(
                sheet.get_cell(target),
                if blocked {
                    Value::Number(99.0)
                } else {
                    Value::Null
                }
            );
            assert_eq!(sheet.get_cell(tail), Value::Null);
            // 修正公式后可重新投影；不能留下旧占用或错误状态。
            if blocked {
                sheet.clear_cell(target);
            }
            sheet.set_formula(anchor, "=SEQUENCE(3,1,7)");
            assert!(matches!(sheet.get_cell(anchor), Value::Array(_)));
            assert_eq!(sheet.get_cell(target), Value::Number(8.0));
            assert_eq!(sheet.get_cell(tail), Value::Number(9.0));
        }
    }
}

#[test]
fn deleted_input_can_fall_back_to_a_scalar_after_an_active_or_blocked_spill() {
    for blocked in [false, true] {
        let mut sheet = Sheet::new();
        sheet.set_cell("B1", Value::Number(472.0));
        if blocked {
            sheet.set_cell("C6", Value::Number(99.0));
        }
        sheet.set_formula("C5", "=IFERROR(SEQUENCE(3,1,B1),9)");
        sheet.set_formula("E10", "=C5+1");
        sheet.get_cell("E10");

        sheet.delete_row(0, 1);

        assert_eq!(sheet.get_cell("C4"), Value::Number(9.0));
        assert_eq!(sheet.get_cell("E9"), Value::Number(10.0));
        assert_eq!(
            sheet.get_cell("C5"),
            if blocked {
                Value::Number(99.0)
            } else {
                Value::Null
            }
        );
        assert_eq!(sheet.get_cell("C6"), Value::Null);
    }
}

#[test]
fn invalid_input_replaces_a_blocked_spill_including_cross_sheet_dependents() {
    let mut workbook = einfach_excel_core::Workbook::new();
    workbook.add_sheet("Beta");
    workbook.set_cell(0, "B1", Value::Number(472.0));
    workbook.set_cell(0, "C6", Value::Number(99.0));
    workbook.set_formula(0, "C5", "=SEQUENCE(3,1,B1)");
    workbook.set_formula(1, "A1", "=Sheet1!C5*2");
    assert_eq!(
        workbook.get_cell("Beta", "A1"),
        Value::Error(ValueError::Spill)
    );

    workbook.set_cell(0, "B1", Value::Text("t44".into()));

    assert_eq!(
        workbook.get_cell("Sheet1", "C5"),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        workbook.get_cell("Beta", "A1"),
        Value::Error(ValueError::WrongType)
    );
    // 原有障碍数据仍在，改回有效输入后应重新得到真实的阻挡错误。
    assert_eq!(workbook.get_cell("Sheet1", "C6"), Value::Number(99.0));
    workbook.set_cell(0, "B1", Value::Number(7.0));
    assert_eq!(
        workbook.get_cell("Beta", "A1"),
        Value::Error(ValueError::Spill)
    );
}
