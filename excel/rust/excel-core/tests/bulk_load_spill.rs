//! Dynamic-array (spill) projection through the *additive* bulk path
//! (`Workbook::bulk_load` → `WorkbookLoader::flush`), which is what the two
//! real user flows use: paste (`bulk_import_cells`) and undo/restore
//! (`restore_sparse`).
//!
//! Sibling of `bulk_install_spill.rs`, which covers the full-sheet REPLACE
//! path (`install_sheet_bulk` / `install_workbook_bulk`).

use einfach_core::Value;
use einfach_excel_core::{CellAddress, Workbook};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

/// Paste shape: an array formula arriving through `Workbook::bulk_load` must
/// own its rectangle once the batch lands, exactly like the same text typed
/// into the cell.
#[test]
fn workbook_bulk_load_projects_pasted_array_formula() {
    let mut wb = Workbook::new();
    wb.bulk_load(|loader| {
        loader.set_formula(0, "H1", "=SEQUENCE(5)");
    });

    for row in 2..=5 {
        assert_eq!(
            wb.get_cell("Sheet1", &format!("H{row}")),
            Value::Number(row as f64),
            "pasted =SEQUENCE(5) must project into H{row}"
        );
    }
    assert_eq!(
        wb.sheet(0).expect("sheet 0").spill_info(addr("H1")),
        Some((5, 1))
    );
}

/// Undo shape: the array spilled, the user deleted the anchor, Ctrl+Z restores
/// the snapshot through `bulk_load`. The restored formula must spill again.
#[test]
fn workbook_bulk_load_reprojects_restored_array_formula() {
    let mut wb = Workbook::new();
    assert!(wb.set_formula(0, "H1", "=SEQUENCE(5)"));
    assert_eq!(wb.get_cell("Sheet1", "H3"), Value::Number(3.0));

    // User deletes the anchor — the whole array goes away.
    wb.clear_cell(0, "H1");
    assert_eq!(wb.get_cell("Sheet1", "H3"), Value::Null);

    // Ctrl+Z: the sparse snapshot is replayed additively through bulk_load.
    wb.bulk_load(|loader| {
        loader.set_formula(0, "H1", "=SEQUENCE(5)");
    });

    for row in 2..=5 {
        assert_eq!(
            wb.get_cell("Sheet1", &format!("H{row}")),
            Value::Number(row as f64),
            "restored =SEQUENCE(5) must project into H{row} again"
        );
    }
}
