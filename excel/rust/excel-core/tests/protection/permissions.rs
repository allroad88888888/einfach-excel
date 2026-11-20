use super::*;
use einfach_excel_core::protection::ProtectionPermissions;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::{SortDirection, SortKey};

#[test]
fn sort_permission_allows_sorting_unlocked_range_only_when_explicitly_enabled() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Header".into()));
    book.set_cell(0, "A2", Value::Number(30.0));
    book.set_cell(0, "A3", Value::Number(10.0));
    book.set_cell(0, "A4", Value::Number(20.0));

    // Unlock A2:A4, protect WITHOUT sort permission -> sort must still fail!
    allow(&mut book, range(1, 0, 3, 0));
    protect(&mut book);
    let keys = [SortKey {
        col: 0,
        direction: SortDirection::Ascending,
        case_sensitive: false,
        empty_first: false,
        custom_list: None,
    }];
    assert!(book.sort_range(0, range(1, 0, 3, 0), &keys, &[]).is_err());

    // Cannot change permissions while protected
    assert!(book
        .change_protection(
            0,
            ProtectionChange::SetPermissions {
                permissions: ProtectionPermissions {
                    sort: true,
                    ..Default::default()
                },
            },
        )
        .is_err());

    // Unprotect, enable sort permission, re-protect
    unprotect(&mut book);
    book.change_protection(
        0,
        ProtectionChange::SetPermissions {
            permissions: ProtectionPermissions {
                sort: true,
                ..Default::default()
            },
        },
    )
    .unwrap();
    protect(&mut book);

    // Sorting a range containing locked A1 still fails
    assert!(book.sort_range(0, range(0, 0, 3, 0), &keys, &[]).is_err());

    // Sorting unlocked A2:A4 succeeds
    let report = book.sort_range(0, range(1, 0, 3, 0), &keys, &[]).unwrap();
    assert_eq!(report.moved_rows, 3);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(10.0));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(20.0));
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Number(30.0));
}

#[test]
fn structural_permissions_gate_insert_delete_rows_and_cols_individually_with_undo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Text("Top".into()));
    book.set_cell(0, "A2", Value::Text("Row2".into()));
    book.set_cell(0, "A3", Value::Text("LockedTail".into()));
    allow(&mut book, range(1, 0, 1, 0));
    book.change_protection(
        0,
        ProtectionChange::SetPermissions {
            permissions: ProtectionPermissions {
                insert_rows: true,
                delete_rows: true,
                ..Default::default()
            },
        },
    )
    .unwrap();
    protect(&mut book);

    // Column insert/delete remain rejected
    assert!(history
        .edit_structure(&mut book, 0, ShiftEdit::ColInsert { at: 0, count: 1 })
        .is_err());
    assert!(history
        .edit_structure(&mut book, 0, ShiftEdit::ColDelete { at: 0, count: 1 })
        .is_err());

    // Row insert succeeds, shifts unlocked range, and Undo/Redo work while protected
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 1, count: 1 })
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("Row2".into()));
    assert_eq!(
        book.read_protection(0).unwrap().unlocked_ranges,
        vec![ProtectionRange::from(range(2, 0, 2, 0))]
    );

    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Text("Row2".into()));
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("Row2".into()));

    // Row delete succeeds on unlocked row A3 while rejecting locked header A1, and Undo succeeds
    // even after locked row A4 ("LockedTail") shifts into row A3!
    assert!(history
        .edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 0, count: 1 })
        .is_err());
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 2, count: 1 })
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("LockedTail".into()));
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("Row2".into()));
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Text("LockedTail".into()));

    // Structural edits on a protected sheet cannot mutate or delete Excel Tables
    let mut table_book = Workbook::new();
    let mut table_hist = WorkbookHistory::default();
    table_book.set_cell(0, "A1", Value::Text("Col1".into()));
    table_book.set_cell(0, "A2", Value::Number(1.0));
    table_book
        .define_table(Some("ProtectedTbl"), 0, range(0, 0, 1, 0), true)
        .unwrap();
    allow(&mut table_book, range(0, 0, 5, 5));
    table_book
        .change_protection(
            0,
            ProtectionChange::SetPermissions {
                permissions: ProtectionPermissions {
                    insert_rows: true,
                    delete_rows: true,
                    ..Default::default()
                },
            },
        )
        .unwrap();
    protect(&mut table_book);
    assert!(table_hist
        .edit_structure(&mut table_book, 0, ShiftEdit::RowInsert { at: 1, count: 1 })
        .is_err());
    assert!(table_hist
        .edit_structure(&mut table_book, 0, ShiftEdit::RowDelete { at: 0, count: 2 })
        .is_err());
    assert!(table_book.get_table("ProtectedTbl").is_some());
}

#[test]
fn protection_permissions_roundtrip_and_backwards_compatible_deserialization() {
    // Old JSON without `permissions` deserializes with all permissions false
    let legacy: SheetProtection = serde_json::from_str(
        r#"{"mode":"protected","unlockedRanges":[]}"#,
    )
    .unwrap();
    assert_eq!(legacy.permissions, ProtectionPermissions::default());

    let mut book = Workbook::new();
    let perms = ProtectionPermissions {
        sort: true,
        insert_rows: true,
        insert_columns: false,
        delete_rows: true,
        delete_columns: false,
    };
    book.change_protection(0, ProtectionChange::SetPermissions { permissions: perms })
        .unwrap();
    protect(&mut book);
    let saved = serde_json::to_string(&book.read_protection(0).unwrap()).unwrap();
    let restored: SheetProtection = serde_json::from_str(&saved).unwrap();
    assert_eq!(restored.permissions, perms);
}
