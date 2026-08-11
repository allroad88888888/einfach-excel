//! Print configuration is semantic workbook state, not a host sidecar.

use super::*;

#[test]
fn print_config_read_write_snapshots_are_detached_and_versioned() {
    let mut workbook = Workbook::new();
    let mut config = workbook.print_config(0).unwrap().config;
    config.orientation = PrintOrientation::Landscape;

    let saved = workbook.set_print_config(0, config).unwrap();
    assert_eq!(saved.revision, 1);
    assert_eq!(saved.config.orientation, PrintOrientation::Landscape);

    let same = workbook.set_print_config(0, saved.config.clone()).unwrap();
    assert_eq!(
        same.revision, 1,
        "same content must not fabricate a write version"
    );

    let mut detached = workbook.print_config(0).unwrap();
    detached.config.orientation = PrintOrientation::Portrait;
    assert_eq!(
        workbook.print_config(0).unwrap().config.orientation,
        PrintOrientation::Landscape
    );
}

#[test]
fn print_config_follows_sheet_topology_and_restores_atomically() {
    let mut workbook = Workbook::new();
    workbook.add_sheet("Data");
    let mut config = workbook.print_config(1).unwrap().config;
    config.scale = PrintScale::Fit {
        pages_wide: Some(1),
        pages_tall: Some(2),
    };
    workbook.set_print_config(1, config).unwrap();
    assert!(workbook.move_sheet(1, 0));
    assert!(matches!(
        workbook.print_config(0).unwrap().config.scale,
        PrintScale::Fit { .. }
    ));

    let before = workbook.snapshot_print_configs();
    let invalid = vec![
        PrintConfigSnapshot {
            sheet: 0,
            revision: 4,
            config: PrintConfig::default(),
        },
        PrintConfigSnapshot {
            sheet: 0,
            revision: 5,
            config: PrintConfig::default(),
        },
    ];
    assert_eq!(
        workbook.restore_print_configs(invalid),
        Err(PrintConfigError::DuplicateSheetSnapshot)
    );
    assert_eq!(workbook.snapshot_print_configs(), before);
}
