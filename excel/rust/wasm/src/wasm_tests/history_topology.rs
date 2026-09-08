#[test]
fn worksheet_commands_and_history_preserve_native_identity() {
    let mut wb = WasmWorkbook::new();
    wb.add_sheet("Summary");
    assert_eq!(
        wb.history.undo_count(),
        0,
        "initialization is not user history"
    );
    let key = wb.sheet_key(0);
    wb.edit_sheet(Some(0), "Orders").unwrap();
    assert!(wb.move_sheet(0, 1));
    assert!(wb.remove_sheet(1));
    assert_eq!(wb.history.undo_count(), 3);
    assert!(wb.history_apply("undo").unwrap());
    assert_eq!(wb.sheet_key(1), key);
    assert!(wb.history_apply("undo").unwrap());
    assert_eq!(wb.sheet_key(0), key);
    assert!(wb.history_apply("undo").unwrap());
    assert_eq!(wb.sheet_name(0), "Sheet1");
    for _ in 0..3 {
        assert!(wb.history_apply("redo").unwrap());
    }
    assert_eq!(wb.sheet_count(), 1);
    assert_eq!(wb.sheet_name(0), "Summary");
}

#[test]
fn archive_drops_removed_subscription_but_remaps_surviving_token_through_undo() {
    let mut wb = WasmWorkbook::new();
    wb.add_sheet("Second");
    for index in 0..2 {
        let sub = wb
            .workbook
            .sheet_mut(index)
            .unwrap()
            .subscribe_cell("A1", || {});
        wb.subscriptions.insert(
            index as u32,
            WorkbookCellSubscription {
                sheet_idx: index,
                sub,
            },
        );
    }
    assert!(wb.remove_sheet(0));
    assert_eq!(wb.debug_live_subscription_count(), 1);
    assert_eq!(wb.subscriptions[&1].sheet_idx, 0);
    wb.history_apply("undo").unwrap();
    assert_eq!(wb.debug_sheet_live_subscription_count(0), 0);
    assert_eq!(wb.subscriptions[&1].sheet_idx, 1);
    wb.unsubscribe_cell(1);
    assert_eq!(wb.debug_live_subscription_count(), 0);
}

#[test]
fn undo_add_unsubscribes_the_sheet_it_archives() {
    let mut wb = WasmWorkbook::new();
    let index = wb.edit_sheet(None, "Second").unwrap();
    let key = wb.sheet_key(index);
    let sub = wb
        .workbook
        .sheet_mut(index as usize)
        .unwrap()
        .subscribe_cell("A1", || {});
    wb.subscriptions.insert(
        5,
        WorkbookCellSubscription {
            sheet_idx: index as usize,
            sub,
        },
    );
    wb.history_apply("undo").unwrap();
    assert_eq!(wb.debug_live_subscription_count(), 0);
    wb.history_apply("redo").unwrap();
    assert_eq!(wb.sheet_key(index), key);
    assert_eq!(wb.debug_sheet_live_subscription_count(index), 0);
}

#[test]
fn rejected_removal_keeps_subscriptions_and_history_untouched() {
    let mut wb = WasmWorkbook::new();
    wb.add_sheet("Second");
    let sub = wb
        .workbook
        .sheet_mut(1)
        .unwrap()
        .subscribe_cell("A1", || {});
    wb.subscriptions
        .insert(5, WorkbookCellSubscription { sheet_idx: 1, sub });
    let a1 = CellAddress::new(0, 0);
    wb.history
        .begin(&wb.workbook, 0, CellRange::new(a1, a1), "Edit", true)
        .unwrap();
    assert!(!wb.remove_sheet(1));
    assert_eq!(wb.debug_live_subscription_count(), 1);
    assert_eq!(wb.sheet_count(), 2);
    wb.history.finish(&mut wb.workbook, false).unwrap();
    assert!(wb.remove_sheet(1));
    assert_eq!(wb.history.undo_count(), 1);
}
