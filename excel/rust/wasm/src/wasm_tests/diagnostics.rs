/// Quick timing for the B-1 reroute. Run with:
/// `cargo test -p einfach-wasm --release bench_restore_persistence_v1 -- --ignored --nocapture`
#[test]
#[ignore = "bench — run manually with --ignored --nocapture"]
fn bench_restore_persistence_v1_50k_plus_50k() {
    let payload = persistence_v1_workload(50_000);
    let mut restored = WasmWorkbook::new();
    let start = std::time::Instant::now();
    let stats = restored.restore_persistence_v1_json(payload).unwrap();
    let elapsed = start.elapsed();
    assert_eq!(stats.restored_cells, 100_000);
    let per_cell_us = elapsed.as_secs_f64() * 1e6 / 100_000.0;
    println!(
            "restore_persistence_v1 50k primitives + 50k formulas: {elapsed:?} ({per_cell_us:.2} us/cell)"
        );
}

#[test]
fn wasm_workbook_debug_live_subscription_counters() {
    let mut wb = WasmWorkbook::new();
    let _ = wb.add_sheet("Sheet2");
    let sub_a = wb
        .workbook
        .sheet_mut(0)
        .unwrap()
        .subscribe_cell("A1", || {});
    wb.subscriptions.insert(
        101,
        WorkbookCellSubscription {
            sheet_idx: 0,
            sub: sub_a,
        },
    );

    let sub_b = wb
        .workbook
        .sheet_mut(1)
        .unwrap()
        .subscribe_cell("B2", || {});
    wb.subscriptions.insert(
        202,
        WorkbookCellSubscription {
            sheet_idx: 1,
            sub: sub_b,
        },
    );

    assert_eq!(wb.debug_live_subscription_count(), 2);
    assert_eq!(wb.debug_sheet_live_subscription_count(0), 1);
    assert_eq!(wb.debug_sheet_live_subscription_count(1), 1);
    assert_eq!(wb.debug_sheet_live_subscription_count(5), 0);

    wb.unsubscribe_cell(101);
    assert_eq!(wb.debug_live_subscription_count(), 1);
    assert_eq!(wb.debug_sheet_live_subscription_count(0), 0);
    assert_eq!(wb.debug_sheet_live_subscription_count(1), 1);
}

#[test]
fn wasm_workbook_move_sheet_remaps_subscription_indices() {
    let mut wb = WasmWorkbook::new();
    let _ = wb.add_sheet("Sheet2");
    let sub = wb
        .workbook
        .sheet_mut(1)
        .unwrap()
        .subscribe_cell("B2", || {});
    wb.subscriptions
        .insert(202, WorkbookCellSubscription { sheet_idx: 1, sub });

    assert_eq!(wb.debug_sheet_live_subscription_count(1), 1);
    assert!(wb.move_sheet(1, 0));
    assert_eq!(wb.sheet_name(0), "Sheet2");
    assert_eq!(wb.debug_live_subscription_count(), 1);
    assert_eq!(wb.debug_sheet_live_subscription_count(0), 1);
    assert_eq!(wb.debug_sheet_live_subscription_count(1), 0);

    wb.unsubscribe_cell(202);
    assert_eq!(wb.debug_live_subscription_count(), 0);
    assert_eq!(wb.debug_sheet_live_subscription_count(0), 0);
}

#[test]
fn wasm_workbook_debug_formula_counters() {
    let mut wb = WasmWorkbook::new();
    let _ = wb.add_sheet("Sheet2");

    assert_eq!(wb.debug_formula_count(), 0);
    assert_eq!(wb.debug_sheet_formula_count(0), 0);
    assert_eq!(wb.debug_sheet_formula_count(1), 0);
    assert_eq!(wb.debug_formula_eval_count_total(), 0);
    assert_eq!(wb.debug_formula_eval_count(0), 0);

    assert!(wb.set_formula(0, "A1", "=1"));
    assert!(wb.set_formula(1, "B1", "=10"));
    assert_eq!(wb.debug_sheet_formula_count(0), 1);
    assert_eq!(wb.debug_sheet_formula_count(1), 1);
    assert_eq!(wb.debug_formula_count(), 2);
    assert_eq!(wb.debug_formula_eval_count_total(), 0);

    assert_eq!(wb.get_number(0, "A1"), 1.0);
    assert_eq!(wb.get_number(1, "B1"), 10.0);
    assert_eq!(wb.debug_formula_eval_count(0), 1);
    assert_eq!(wb.debug_formula_eval_count(1), 1);
    assert_eq!(wb.debug_formula_eval_count_total(), 2);
}

#[cfg(target_arch = "wasm32")]
#[derive(serde::Serialize)]
struct TestBulkImportCell {
    sheet: usize,
    row: u32,
    col: u32,
    kind: &'static str,
    value: TestBulkImportValue,
}

#[cfg(target_arch = "wasm32")]
#[derive(serde::Serialize)]
#[serde(untagged)]
enum TestBulkImportValue {
    Number(f64),
    Text(String),
}

#[cfg(target_arch = "wasm32")]
#[derive(serde::Deserialize)]
struct TestBulkImportStats {
    accepted: u32,
    formulas: u32,
    #[serde(rename = "rejectedFormulas")]
    rejected_formulas: u32,
    errors: u32,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen_test::wasm_bindgen_test]
fn wasm_workbook_bulk_import_many_formulas_stays_lazy_until_read() {
    const FORMULA_COUNT: u32 = 1_000;

    let mut cells = Vec::with_capacity((FORMULA_COUNT * 2) as usize);
    for row in 0..FORMULA_COUNT {
        let spreadsheet_row = row + 1;
        cells.push(TestBulkImportCell {
            sheet: 0,
            row,
            col: 0,
            kind: "number",
            value: TestBulkImportValue::Number(spreadsheet_row as f64),
        });
        cells.push(TestBulkImportCell {
            sheet: 0,
            row,
            col: 1,
            kind: "formula",
            value: TestBulkImportValue::Text(format!("=A{spreadsheet_row}+1")),
        });
    }

    let import_value = serde_wasm_bindgen::to_value(&cells).expect("serialize bulk import cells");
    let mut wb = WasmWorkbook::new();
    let stats_value = wb
        .bulk_import_cells(import_value)
        .expect("bulk import cells should succeed");
    let stats: TestBulkImportStats =
        serde_wasm_bindgen::from_value(stats_value).expect("deserialize import stats");

    assert_eq!(stats.accepted, FORMULA_COUNT * 2);
    assert_eq!(stats.formulas, FORMULA_COUNT);
    assert_eq!(stats.rejected_formulas, 0);
    assert_eq!(stats.errors, 0);
    assert_eq!(wb.debug_formula_count(), FORMULA_COUNT);
    assert_eq!(wb.debug_formula_eval_count_total(), 0);

    let targets = [
        ("B1", "2"),
        ("B250", "251"),
        ("B500", "501"),
        ("B1000", "1001"),
    ];
    for (idx, (addr, expected)) in targets.iter().enumerate() {
        assert_eq!(wb.get_display(0, addr), *expected);
        assert_eq!(wb.debug_formula_eval_count_total(), (idx + 1) as u32);
    }

    assert_eq!(wb.debug_formula_cache_state(0, "B999"), "dirty");
    assert_eq!(wb.get_display(0, "A1000"), "1000");
    assert_eq!(wb.debug_formula_eval_count_total(), targets.len() as u32);
}
