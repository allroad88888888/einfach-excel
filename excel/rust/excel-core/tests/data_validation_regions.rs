//! 验证区域覆盖/清除/结构随动只改稀疏元数据。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind as Kind, DataValidationRule as Rule};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Sheet, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn rule(max: f64) -> Rule {
    Rule {
        kind: Kind::WholeNumber { min: 0.0, max },
        ignore_blank: true,
        operator: Default::default(),
        options: Default::default(),
    }
}

#[test]
fn replacing_a_middle_cell_preserves_every_other_cell_without_materializing_them() {
    let mut sheet = Sheet::new();
    let atoms = sheet.debug_total_atom_count();
    sheet
        .set_data_validation(range("A1", "C1000"), Some(rule(10.0)))
        .unwrap();
    sheet
        .set_data_validation(range("B56", "B56"), Some(rule(20.0)))
        .unwrap();
    assert_eq!(sheet.data_validations().len(), 5);
    for addr in range("A1", "C1000").iter() {
        let expected = if addr == CellAddress::parse("B56").unwrap() {
            rule(20.0)
        } else {
            rule(10.0)
        };
        assert_eq!(sheet.data_validation_at(addr), Some(&expected));
        assert_eq!(
            sheet
                .data_validations()
                .iter()
                .filter(|r| r.range.contains(addr))
                .count(),
            1
        );
    }
    sheet
        .set_data_validation(range("B56", "B56"), None)
        .unwrap();
    assert!(sheet
        .data_validation_at(CellAddress::parse("B56").unwrap())
        .is_none());
    assert_eq!(sheet.debug_total_atom_count(), atoms);
}

#[test]
fn clear_overlaps_only_and_invalid_definition_cannot_erase_existing_rules() {
    let mut sheet = Sheet::new();
    sheet
        .set_data_validation(range("A1", "A100"), Some(rule(10.0)))
        .unwrap();
    let before = sheet.data_validations().to_vec();
    sheet
        .set_data_validation(range("A20", "A30"), Some(rule(10.0)))
        .unwrap();
    assert_eq!(sheet.data_validations(), before);
    assert!(sheet
        .set_data_validation(range("A1", "A100"), Some(rule(-1.0)))
        .is_err());
    assert_eq!(sheet.data_validations(), before);
    assert!(sheet
        .set_data_validation(range("A100", "A1"), None)
        .is_err());
    assert_eq!(sheet.data_validations(), before);
    sheet
        .set_data_validation(range("A40", "B60"), None)
        .unwrap();
    assert_eq!(
        sheet
            .data_validations()
            .iter()
            .map(|r| r.range)
            .collect::<Vec<_>>(),
        vec![range("A1", "A39"), range("A61", "A100")]
    );
}

#[test]
fn structural_history_restores_deleted_rules_and_exact_regions() {
    for edit in [
        ShiftEdit::RowInsert { at: 2, count: 2 },
        ShiftEdit::RowDelete { at: 2, count: 2 },
        ShiftEdit::ColInsert { at: 1, count: 1 },
        ShiftEdit::ColDelete { at: 0, count: 3 },
    ] {
        let mut book = Workbook::new();
        book.sheet_mut(0)
            .unwrap()
            .set_data_validation(range("B2", "C5"), Some(rule(10.0)))
            .unwrap();
        let before = book.sheet(0).unwrap().data_validations().to_vec();
        let mut history = WorkbookHistory::default();
        assert!(history.edit_structure(&mut book, 0, edit).unwrap());
        let after = book.sheet(0).unwrap().data_validations().to_vec();
        assert_ne!(before, after);
        let expected: Vec<_> = match edit {
            ShiftEdit::RowInsert { .. } => vec![range("B2", "C7")],
            ShiftEdit::RowDelete { .. } => vec![range("B2", "C3")],
            ShiftEdit::ColInsert { .. } => vec![range("C2", "D5")],
            ShiftEdit::ColDelete { .. } => vec![],
        };
        assert_eq!(
            after.iter().map(|entry| entry.range).collect::<Vec<_>>(),
            expected
        );
        for _ in 0..3 {
            assert!(history.undo(&mut book).unwrap());
            assert_eq!(book.sheet(0).unwrap().data_validations(), before);
            assert!(history.redo(&mut book).unwrap());
            assert_eq!(book.sheet(0).unwrap().data_validations(), after);
        }
    }
}

#[test]
fn whole_columns_stay_bounded_but_finite_ranges_cannot_be_pushed_off_the_sheet() {
    let mut book = Workbook::new();
    book.sheet_mut(0)
        .unwrap()
        .set_data_validation(range("A1", "A1048576"), Some(rule(10.0)))
        .unwrap();
    book.try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 2 })
        .unwrap();
    assert_eq!(
        book.sheet(0).unwrap().data_validations()[0].range,
        range("A1", "A1048576")
    );
    book.sheet_mut(0)
        .unwrap()
        .set_data_validation(range("C1048576", "C1048576"), Some(rule(10.0)))
        .unwrap();
    book.set_cell(0, "C1", Value::Number(3.0));
    let before = book.sheet(0).unwrap().data_validations().to_vec();
    assert!(book
        .try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
    assert_eq!(book.sheet(0).unwrap().data_validations(), before);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(3.0));
}

#[test]
fn sheet_move_and_delete_undo_keep_the_same_validation_config() {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.sheet_mut(0)
        .unwrap()
        .set_data_validation(range("B2", "B9"), Some(rule(10.0)))
        .unwrap();
    let before = book.sheet(0).unwrap().data_validations().to_vec();
    let mut history = WorkbookHistory::default();
    history.move_sheet(&mut book, 0, 1).unwrap();
    assert_eq!(book.sheet(1).unwrap().data_validations(), before);
    history.remove_sheet(&mut book, 1).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(1).unwrap().data_validations(), before);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().data_validations(), before);
}

#[test]
fn repeated_overlapping_rectangles_match_a_small_grid_oracle() {
    let mut sheet = Sheet::new();
    let mut expected = [[None; 8]; 8];
    // 固定种子只生成操作几何；逐格参考结果只存在于测试，不进入生产实现。
    let mut seed = 0x12345678u32;
    let mut next = || {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        (seed >> 24) % 8
    };
    for step in 0..400 {
        let area = CellRange::new(
            CellAddress::new(next(), next()),
            CellAddress::new(next(), next()),
        )
        .normalize();
        let value = (step % 3 != 0).then_some((step % 5 + 1) as f64);
        sheet.set_data_validation(area, value.map(rule)).unwrap();
        for addr in area.iter() {
            expected[addr.row as usize][addr.col as usize] = value;
        }
        for (row, cells) in expected.iter().enumerate() {
            for (col, value) in cells.iter().enumerate() {
                let addr = CellAddress::new(row as u32, col as u32);
                assert_eq!(sheet.data_validation_at(addr), value.map(rule).as_ref());
                assert_eq!(
                    sheet
                        .data_validations()
                        .iter()
                        .filter(|r| r.range.contains(addr))
                        .count(),
                    usize::from(value.is_some())
                );
            }
        }
    }
}

#[test]
fn region_limit_rejects_a_split_without_partial_changes() {
    use einfach_excel_core::data_validation::MAX_VALIDATION_REGIONS;
    let mut sheet = Sheet::new();
    for row in 0..MAX_VALIDATION_REGIONS as u32 {
        let area = CellRange::new(
            CellAddress::new(row * 4, 0),
            CellAddress::new(row * 4 + 2, 2),
        );
        sheet.set_data_validation(area, Some(rule(10.0))).unwrap();
    }
    let before = sheet.data_validations().to_vec();
    assert!(sheet
        .set_data_validation(range("B2", "B2"), Some(rule(20.0)))
        .is_err());
    assert!(sheet.set_data_validation(range("B2", "B2"), None).is_err());
    assert_eq!(sheet.data_validations(), before);
    sheet.set_data_validation(range("A1", "C3"), None).unwrap();
    assert_eq!(sheet.data_validations().len(), MAX_VALIDATION_REGIONS - 1);
}
