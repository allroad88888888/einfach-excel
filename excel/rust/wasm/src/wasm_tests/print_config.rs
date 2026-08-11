// The persistence envelope must carry engine-owned print configuration.
#[test]
fn print_config_wasm_binding_round_trips_and_persists() {
    let mut workbook = WasmWorkbook::new();
    let config = PrintConfigJSON {
        print_area: None,
        manual_page_breaks: vec![ManualPageBreakJSON {
            axis: ManualPageBreakAxisJSON::Row,
            index: 3,
        }],
        scale: PrintScaleJSON::Fit {
            pages_wide: Some(1),
            pages_tall: Some(2),
        },
        orientation: PrintOrientationJSON::Landscape,
        header: None,
        footer: None,
    };
    let saved = PrintConfigSnapshotJSON::from_snapshot(
        &workbook
            .workbook
            .set_print_config(0, config.into_config().unwrap())
            .unwrap(),
    );
    assert_eq!(saved.revision, 1);

    let snapshot = workbook.snapshot_persistence_v1_json();
    assert_eq!(snapshot.print_configs.len(), 1);
    let mut restored = WasmWorkbook::new();
    let stats = restored.restore_persistence_v1_json(snapshot).unwrap();
    assert_eq!(stats.restored_print_configs, 1);
    let read = PrintConfigSnapshotJSON::from_snapshot(&restored.workbook.print_config(0).unwrap());
    assert_eq!(read.revision, 1);
    assert!(matches!(
        read.config.orientation,
        PrintOrientationJSON::Landscape
    ));
}

#[test]
fn invalid_print_config_persistence_does_not_replace_the_live_workbook() {
    let mut workbook = WasmWorkbook::new();
    assert!(workbook.rename_sheet(0, "Keep"));
    let payload = WorkbookPersistenceV1JSON {
        version: 1,
        sheets: vec![WorkbookPersistenceSheetMetaJSON {
            idx: 0,
            name: "Loaded".into(),
        }],
        cells: vec![],
        formats: vec![],
        sizes: vec![],
        tables: vec![],
        hidden: vec![],
        filters: vec![],
        print_configs: vec![default_print_snapshot(3), default_print_snapshot(4)],
    };

    assert!(workbook.restore_persistence_v1_json(payload).is_err());
    assert_eq!(workbook.sheet_name(0), "Keep");
}

fn default_print_snapshot(revision: u64) -> PrintConfigSnapshotJSON {
    PrintConfigSnapshotJSON {
        sheet: 0,
        revision,
        config: PrintConfigJSON {
            print_area: None,
            manual_page_breaks: vec![],
            scale: PrintScaleJSON::Percent { percent: 100.0 },
            orientation: PrintOrientationJSON::Portrait,
            header: None,
            footer: None,
        },
    }
}
