#[test]
fn wasm_workbook_snapshot_persistence_v1_roundtrip_sparse_formula_and_formats() {
    let mut source = WasmWorkbook::new();
    assert!(source.rename_sheet(0, "Data"));
    let _ = source.add_sheet("Calc");

    source.set_number(0, "A1", 10.0);
    source.set_text(0, "B2", "hello");
    assert!(source.set_formula(0, "C3", "=A1+1"));
    source.set_number(1, "A1", 100.0);

    let number_fmt = CellFormatJSON {
        number_format: Some(NumberFormatJSON {
            kind: "decimal".into(),
            digits: Some(2),
            symbol: None,
            pattern: None,
            thousands: Some(true),
        }),
        ..Default::default()
    };
    source.workbook.sheet_mut(0).unwrap().set_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 0)),
        number_fmt.clone().into_format(),
    );
    let custom_fmt = CellFormatJSON {
        number_format: Some(NumberFormatJSON {
            kind: "custom".into(),
            digits: None,
            symbol: None,
            pattern: Some("#,##0.0\" kg\"".into()),
            thousands: None,
        }),
        ..Default::default()
    };
    source.workbook.sheet_mut(1).unwrap().set_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 0)),
        custom_fmt.into_format(),
    );

    assert_eq!(source.debug_formula_cache_state(0, "C3"), "dirty");
    assert_eq!(source.debug_formula_eval_count(0), 0);

    let envelope = source.snapshot_persistence_v1_json();

    assert_eq!(envelope.version, 1);
    assert_eq!(envelope.sheets.len(), 2);
    assert_eq!(envelope.sheets[0].idx, 0);
    assert_eq!(envelope.sheets[0].name, "Data");
    assert_eq!(envelope.sheets[1].idx, 1);
    assert_eq!(envelope.sheets[1].name, "Calc");

    let formula_cell = envelope
        .cells
        .iter()
        .find(|cell| cell.sheet == 0 && cell.addr == "C3")
        .expect("formula cell should be included");
    assert_eq!(formula_cell.kind, "formula");
    match &formula_cell.value {
        Some(ImportValueJSON::Text(source)) => assert_eq!(source, "=A1+1"),
        other => panic!("expected formula source in persistence payload: {other:?}"),
    }

    assert_eq!(envelope.formats.len(), 2);

    let mut restored = WasmWorkbook::new();
    let stats = restored.restore_persistence_v1_json(envelope).unwrap();

    assert_eq!(stats.sheets, 2);
    assert_eq!(stats.restored_cells, 4);

    assert_eq!(restored.sheet_name(0), "Data");
    assert_eq!(restored.sheet_name(1), "Calc");
    assert_eq!(restored.get_number(0, "A1"), 10.0);
    assert_eq!(restored.get_display(0, "B2"), "hello");
    assert_eq!(restored.get_formula(0, "C3"), "=A1+1");
    assert_eq!(restored.debug_formula_cache_state(0, "C3"), "dirty");
    assert_eq!(restored.debug_formula_eval_count(0), 0);
    assert_eq!(restored.get_number(0, "C3"), 11.0);
    assert_eq!(restored.debug_formula_cache_state(0, "C3"), "clean");
    assert_eq!(restored.debug_formula_eval_count(0), 1);
    assert_eq!(restored.get_number(1, "A1"), 100.0);

    let restored_fmt = restored
        .workbook
        .sheet(0)
        .unwrap()
        .snapshot_format_range(CellRange::new(
            CellAddress::new(0, 0),
            CellAddress::new(2, 0),
        ));
    assert_eq!(restored_fmt.range_formats.len(), 1);
    assert!(matches!(
        restored_fmt.range_formats[0].fmt.number_format,
        NumberFormat::Decimal {
            digits: 2,
            thousands: true
        }
    ));

    let restored_custom_fmt =
        restored
            .workbook
            .sheet(1)
            .unwrap()
            .snapshot_format_range(CellRange::new(
                CellAddress::new(0, 0),
                CellAddress::new(0, 0),
            ));
    assert_eq!(restored_custom_fmt.range_formats.len(), 1);
    match &restored_custom_fmt.range_formats[0].fmt.number_format {
        NumberFormat::Custom(pattern) => assert_eq!(pattern, "#,##0.0\" kg\""),
        other => panic!("expected custom number format, got {other:?}"),
    }
    assert_eq!(
        restored.workbook.sheet(1).unwrap().formatted_display("A1"),
        "100.0 kg"
    );
}

#[test]
fn wasm_workbook_snapshot_persistence_v1_keeps_format_only_sheet() {
    let mut wb = WasmWorkbook::new();
    let _ = wb.add_sheet("FormatOnly");
    let fmt = CellFormatJSON {
        number_format: Some(NumberFormatJSON {
            kind: "percent".into(),
            digits: Some(0),
            symbol: None,
            pattern: None,
            thousands: None,
        }),
        ..Default::default()
    };
    wb.workbook.sheet_mut(1).unwrap().set_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 4)),
        fmt.into_format(),
    );

    // 一张只有格式、没有任何单元格的表：cells 为空，但 formats 必须带上它 ——
    // 否则 restore 出来的表会丢掉全部格式。
    let envelope = wb.snapshot_persistence_v1_json();
    assert_eq!(envelope.sheets.len(), 2);
    assert_eq!(envelope.cells.len(), 0);
    assert_eq!(envelope.formats[1].range_formats.len(), 1);
}

#[test]
fn wasm_workbook_viewport_size_facts_roundtrip_without_cells() {
    let mut source = WasmWorkbook::new();
    assert!(source.set_row_height(0, 3, 44));
    assert!(source.set_col_width(0, 2, 128));

    let envelope = source.snapshot_persistence_v1_json();
    assert_eq!(envelope.cells.len(), 0);
    assert_eq!(envelope.sizes.len(), 1);
    assert_eq!(envelope.sizes[0].row_heights[0].row_index, 3);
    assert_eq!(envelope.sizes[0].row_heights[0].height_px, 44);
    assert_eq!(envelope.sizes[0].col_widths[0].col_index, 2);
    assert_eq!(envelope.sizes[0].col_widths[0].width_px, 128);

    let mut restored = WasmWorkbook::new();
    let stats = restored.restore_persistence_v1_json(envelope).unwrap();
    assert_eq!(stats.restored_cells, 0);

    let snapshot = ViewportSizeSnapshotJSON::from_sheet_range(
        restored.workbook.sheet(0).unwrap(),
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(10, 10)),
        Some(0),
    );
    assert_eq!(snapshot.row_heights.len(), 1);
    assert_eq!(snapshot.row_heights[0].row_index, 3);
    assert_eq!(snapshot.row_heights[0].height_px, 44);
    assert_eq!(snapshot.col_widths.len(), 1);
    assert_eq!(snapshot.col_widths[0].col_index, 2);
    assert_eq!(snapshot.col_widths[0].width_px, 128);
}

#[test]
fn wasm_workbook_snapshot_viewport_sizes_filters_window() {
    let mut wb = WasmWorkbook::new();
    let _ = wb.add_sheet("Second");
    assert!(wb.set_row_height(1, 1, 24));
    assert!(wb.set_row_height(1, 9, 48));
    assert!(wb.set_col_width(1, 2, 120));
    assert!(wb.set_col_width(1, 8, 240));

    let snapshot = ViewportSizeSnapshotJSON::from_sheet_range(
        wb.workbook.sheet(1).unwrap(),
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 4)),
        Some(1),
    );
    assert_eq!(snapshot.sheet, Some(1));
    assert_eq!(snapshot.row_heights.len(), 1);
    assert_eq!(snapshot.row_heights[0].row_index, 1);
    assert_eq!(snapshot.col_widths.len(), 1);
    assert_eq!(snapshot.col_widths[0].col_index, 2);
}
