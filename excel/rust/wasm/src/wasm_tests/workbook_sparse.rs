#[test]
fn wasm_workbook_three_sheet_chain() {
    let mut wb = WasmWorkbook::new();
    wb.add_sheet("Sheet2");
    wb.add_sheet("Sheet3");

    wb.set_number(0, "B4", 10.0);
    assert!(wb.set_formula(2, "B2", "=Sheet1!B4+1"));
    assert!(wb.set_formula(1, "B2", "=Sheet3!B2+1"));
    assert!(wb.set_formula(0, "B2", "=Sheet2!B2+1"));

    assert_eq!(wb.get_number(2, "B2"), 11.0);
    assert_eq!(wb.get_number(1, "B2"), 12.0);
    assert_eq!(wb.get_number(0, "B2"), 13.0);

    wb.set_number(0, "B4", 20.0);
    assert_eq!(wb.get_number(0, "B2"), 23.0);
}

#[test]
fn wasm_workbook_move_sheet_preserves_cross_sheet_chain() {
    let mut wb = WasmWorkbook::new();
    wb.add_sheet("Sheet2");
    wb.add_sheet("Sheet3");

    wb.set_number(0, "B4", 10.0);
    assert!(wb.set_formula(2, "C2", "=Sheet1!B4+1"));
    assert!(wb.set_formula(1, "C2", "=Sheet3!C2+1"));
    assert!(wb.set_formula(0, "C2", "=Sheet2!C2+1"));

    assert_eq!(wb.get_number(0, "C2"), 13.0);
    assert!(wb.move_sheet(2, 0));
    assert_eq!(wb.sheet_name(0), "Sheet3");
    assert_eq!(wb.sheet_name(1), "Sheet1");
    assert_eq!(wb.sheet_name(2), "Sheet2");
    assert_eq!(wb.get_number(1, "C2"), 13.0);

    wb.set_number(1, "B4", 20.0);
    assert_eq!(wb.debug_formula_cache_state(0, "C2"), "clean");
    assert_eq!(wb.debug_formula_cache_state(2, "C2"), "clean");
    assert_eq!(wb.debug_formula_cache_state(1, "C2"), "clean");
    assert_eq!(wb.get_number(1, "C2"), 23.0);
}

#[test]
fn wasm_workbook_independent_formula_stays_dirty_until_read() {
    let mut wb = WasmWorkbook::new();
    wb.add_sheet("Sheet2");
    wb.add_sheet("Sheet3");

    wb.set_number(0, "B4", 10.0);
    wb.set_number(2, "B4", 100.0);
    assert!(wb.set_formula(2, "C2", "=Sheet1!B4+1"));
    assert!(wb.set_formula(1, "C2", "=Sheet3!C2+1"));
    assert!(wb.set_formula(0, "C2", "=Sheet2!C2+1"));
    assert!(wb.set_formula(1, "C5", "=Sheet3!B4+5"));

    assert_eq!(wb.get_number(0, "C2"), 13.0);
    assert_eq!(wb.debug_formula_cache_state(1, "C5"), "dirty");

    assert_eq!(wb.get_number(1, "C5"), 105.0);
    assert_eq!(wb.debug_formula_cache_state(1, "C5"), "clean");
}

#[test]
fn wasm_workbook_snapshot_range_sparse_does_not_eval_formula() {
    let mut wb = WasmWorkbook::new();
    wb.set_number(0, "A1", 41.0);
    assert!(wb.set_formula(0, "C5", "=A1+1"));

    assert_eq!(wb.debug_formula_cache_state(0, "C5"), "dirty");
    assert_eq!(wb.debug_formula_eval_count(0), 0);

    let cells = wb.snapshot_range_sparse_cells(0, 4, 2, 4, 2);

    assert_eq!(cells.len(), 1);
    assert_eq!(cells[0].addr, "C5");
    assert_eq!(cells[0].kind, "formula");
    match &cells[0].value {
        Some(ImportValueJSON::Text(source)) => assert_eq!(source, "=A1+1"),
        other => panic!("unexpected sparse formula value: {other:?}"),
    }
    assert_eq!(wb.debug_formula_cache_state(0, "C5"), "dirty");
    assert_eq!(wb.debug_formula_eval_count(0), 0);
}

#[test]
fn wasm_workbook_restore_sparse_reinstalls_formulas_dirty() {
    let mut wb = WasmWorkbook::new();
    wb.set_number(0, "A1", 5.0);
    wb.set_text(0, "A2", "hello");
    assert!(wb.set_formula(0, "B2", "=A1+1"));

    let cells = wb.snapshot_range_sparse_cells(0, 0, 0, 1, 1);
    assert_eq!(cells.len(), 3);

    assert_eq!(wb.clear_range(0, 0, 0, 1, 1), 3);
    assert_eq!(wb.get_type(0, "A1"), "null");
    assert_eq!(wb.get_formula(0, "B2"), "");

    assert_eq!(wb.restore_sparse_cells(cells), 3);
    assert_eq!(wb.get_display(0, "A1"), "5");
    assert_eq!(wb.get_display(0, "A2"), "hello");
    assert_eq!(wb.get_formula(0, "B2"), "=A1+1");
    assert_eq!(wb.debug_formula_cache_state(0, "B2"), "dirty");
    assert_eq!(wb.debug_formula_eval_count(0), 0);

    assert_eq!(wb.get_display(0, "B2"), "6");
    assert_eq!(wb.debug_formula_cache_state(0, "B2"), "clean");
    assert_eq!(wb.debug_formula_eval_count(0), 1);
}

/// `spillBlocker` 把引擎的诊断答案原样送到 JS 边界：碰撞态锚点给出行主序
/// 第一个阻塞地址的 A1 字符串，其余一律 `null`。
///
/// 在 WASM 侧单独钉一条的理由是这个导出**只**在这里做地址字符串化 ——
/// `Sheet::spill_blocker` 回的是 `CellAddress`，回错格式（比如零基下标）在
/// Rust 单测里看不出来，只有跨过边界才暴露。
#[test]
fn wasm_workbook_spill_blocker_reports_the_obstruction_as_a1() {
    let mut wb = WasmWorkbook::new();
    wb.set_cell_number(0, "H3", 999.0);
    assert!(wb.set_formula(0, "H1", "=SEQUENCE(10)"));
    assert_eq!(wb.get_display(0, "H1"), "#SPILL!");

    assert_eq!(
        wb.workbook.spill_blocker(0, "H1"),
        Some(CellAddress::new(2, 7)),
        "H3 挡着 H1:H10"
    );
    // 非碰撞态、非法地址、越界表号都答不出 —— JS 侧看到的都是 `null`。
    assert_eq!(wb.workbook.spill_blocker(0, "H3"), None);
    assert_eq!(wb.workbook.spill_blocker(0, "not-an-addr"), None);
    assert_eq!(wb.workbook.spill_blocker(99, "H1"), None);
}

/// A dynamic-array region contributes exactly ONE sparse record: its
/// anchor's formula source. The nine projected targets of
/// `=SEQUENCE(10)` are derived views of the anchor's array, and a
/// snapshot that emitted them as `kind:"number"` literals would make
/// every restore path re-materialize them as real cells that occupy the
/// anchor's own spill region.
#[test]
fn wasm_workbook_snapshot_range_sparse_omits_spill_projections() {
    let mut wb = WasmWorkbook::new();
    assert!(wb.set_formula(0, "H1", "=SEQUENCE(10)"));
    // Force the spill to exist before snapshotting.
    assert_eq!(wb.get_display(0, "H10"), "10");
    let sheet = wb.workbook.sheet(0).unwrap();
    assert!(
        !sheet.is_spilled(CellAddress::new(0, 7)),
        "anchor is not a target"
    );
    assert!(
        sheet.is_spilled(CellAddress::new(9, 7)),
        "H10 is a spill target"
    );

    // H1:H10.
    let cells = wb.snapshot_range_sparse_cells(0, 0, 7, 9, 7);

    assert_eq!(cells.len(), 1, "unexpected sparse records: {cells:?}");
    assert_eq!(cells[0].addr, "H1");
    assert_eq!(cells[0].kind, "formula");
    // Full-workbook snapshot agrees — both walk the same helper.
    assert_eq!(wb.snapshot_sparse_cells().len(), 1);
}

/// Persistence roundtrip of a spilled workbook. Two distinct facts are
/// asserted, because the pre-fix bug passed the first one by accident:
/// the displays come back right, AND the restored region is a LIVE
/// projection (re-pointing the anchor moves the whole region) rather
/// than a frozen copy of literals.
#[test]
fn wasm_workbook_persistence_v1_roundtrip_keeps_spill_a_live_projection() {
    let mut source = WasmWorkbook::new();
    assert!(source.set_formula(0, "H1", "=SEQUENCE(10)"));
    assert_eq!(source.get_display(0, "H1"), "1");
    assert_eq!(source.get_display(0, "H10"), "10");

    let envelope = source.snapshot_persistence_v1_json();
    assert_eq!(
        envelope.cells.len(),
        1,
        "unexpected cells: {:?}",
        envelope.cells
    );

    let mut restored = WasmWorkbook::new();
    let stats = restored.restore_persistence_v1_json(envelope).unwrap();
    assert_eq!(stats.restored_cells, 1);

    // (1) The anchor still spills — pre-fix it read back `#SPILL!`
    // because the nine restored literals occupied its own region.
    assert_eq!(restored.get_display(0, "H1"), "1");
    assert_eq!(restored.get_display(0, "H2"), "2");
    assert_eq!(restored.get_display(0, "H10"), "10");

    // (2) The targets are projections, not literals: they carry no
    // formula of their own, the engine indexes them, and re-pointing
    // the anchor at a shorter array moves the region and CLEARS the
    // rows the new array no longer covers. Frozen literals would keep
    // showing 4..10 and would flip the anchor to `#SPILL!`.
    assert_eq!(restored.get_formula(0, "H2"), "");
    {
        let sheet = restored.workbook.sheet(0).unwrap();
        assert!(sheet.is_spilled(CellAddress::new(1, 7)));
        assert!(sheet.is_spilled(CellAddress::new(9, 7)));
    }
    assert!(restored.set_formula(0, "H1", "=SEQUENCE(3,1,100,1)"));
    assert_eq!(restored.get_display(0, "H1"), "100");
    assert_eq!(restored.get_display(0, "H2"), "101");
    assert_eq!(restored.get_display(0, "H3"), "102");
    assert_eq!(restored.get_type(0, "H4"), "null");
    assert_eq!(restored.get_type(0, "H10"), "null");
}
