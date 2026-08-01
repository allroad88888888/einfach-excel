//! Dynamic-array (spill) projection through the storage-primary bulk
//! install (`Workbook::install_sheet_bulk` / `install_workbook_bulk`, the
//! engine side of the WASM `bulk_install_workbook` import path).
//!
//! Regression: the install parked formula sources lazily but never gave
//! array-producing formulas their spill targets, so an imported
//! `=SEQUENCE(10)` rendered as a single value at the anchor and empty cells
//! below it — while the same formula typed into a cell spilled correctly.
//! See `excel/rust/excel-core/src/sheet.rs` §
//! `install_bulk_spill_projections` for why the projection has to happen at
//! install time.

use std::collections::HashMap;

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, Workbook};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

/// Install `formulas` (and optional primitives) into sheet 0 of a fresh
/// workbook through the storage-primary path.
fn installed(primitives: &[(&str, Value)], formulas: &[(&str, &str)]) -> Workbook {
    let mut wb = Workbook::new();
    let prims: HashMap<CellAddress, Value> = primitives
        .iter()
        .map(|(a, v)| (addr(a), v.clone()))
        .collect();
    let fs: HashMap<CellAddress, String> = formulas
        .iter()
        .map(|(a, src)| (addr(a), (*src).to_string()))
        .collect();
    wb.install_sheet_bulk(0, prims, fs)
        .expect("install must succeed");
    wb
}

fn cell(wb: &mut Workbook, a: &str) -> Value {
    wb.get_cell("Sheet1", a)
}

/// Single-column `=SEQUENCE(10)` bulk-installed at H1 spills into H2..H10.
/// The anchor holds the raw `Value::Array` (the WASM boundary collapses it
/// to the top-left scalar); the targets return indexed scalars.
#[test]
fn bulk_install_projects_single_column_sequence() {
    let mut wb = installed(&[], &[("H1", "=SEQUENCE(10)")]);

    match cell(&mut wb, "H1") {
        Value::Array(a) => {
            assert_eq!(a.shape(), (10, 1));
            assert_eq!(a.get(0, 0), Some(&Value::Number(1.0)));
        }
        other => panic!("expected Array at anchor H1, got {other:?}"),
    }
    for row in 2..=10 {
        assert_eq!(
            cell(&mut wb, &format!("H{row}")),
            Value::Number(row as f64),
            "spill target H{row} must be projected by the bulk install"
        );
    }
    // Just past the spill rectangle.
    assert_eq!(cell(&mut wb, "H11"), Value::Null);

    // The anchor is a real spill anchor, not a lucky value.
    assert_eq!(
        wb.sheet(0).expect("sheet 0").spill_info(addr("H1")),
        Some((10, 1))
    );
}

/// Two-dimensional `=SEQUENCE(4,3)` bulk-installed at B2 fills B2:D5.
#[test]
fn bulk_install_projects_two_dimensional_sequence() {
    let mut wb = installed(&[], &[("B2", "=SEQUENCE(4,3)")]);

    match cell(&mut wb, "B2") {
        Value::Array(a) => assert_eq!(a.shape(), (4, 3)),
        other => panic!("expected Array at anchor B2, got {other:?}"),
    }
    // SEQUENCE(4,3) numbers row-major: B2..D2 = 1..3, B3..D3 = 4..6, ...
    let cols = ["B", "C", "D"];
    for (ri, row) in (2..=5).enumerate() {
        for (ci, col) in cols.iter().enumerate() {
            let a = format!("{col}{row}");
            let expected = (ri * 3 + ci + 1) as f64;
            if ri == 0 && ci == 0 {
                continue; // anchor holds the Array itself
            }
            assert_eq!(
                cell(&mut wb, &a),
                Value::Number(expected),
                "spill target {a} mismatched"
            );
        }
    }
    // Outside the rectangle in both directions.
    assert_eq!(cell(&mut wb, "E2"), Value::Null);
    assert_eq!(cell(&mut wb, "B6"), Value::Null);
}

/// A bulk-installed primitive inside the spill rectangle blocks the spill:
/// the anchor surfaces `#SPILL!`, the obstruction keeps its value, and no
/// targets are installed. `is_target_occupied` reaches parked `CellSlot::Plain`
/// values, so this holds even though the blocker never materialized an atom.
#[test]
fn bulk_install_spill_collision_with_primitive_marks_anchor() {
    let mut wb = installed(&[("A3", Value::Number(99.0))], &[("A1", "=SEQUENCE(5)")]);

    assert_eq!(cell(&mut wb, "A1"), Value::Error(ValueError::Spill));
    assert_eq!(cell(&mut wb, "A3"), Value::Number(99.0));
    assert_eq!(cell(&mut wb, "A2"), Value::Null);
    assert_eq!(cell(&mut wb, "A4"), Value::Null);
    assert_eq!(cell(&mut wb, "A5"), Value::Null);
    assert_eq!(wb.sheet(0).expect("sheet 0").spill_info(addr("A1")), None);
}

/// A bulk-installed FORMULA inside the spill rectangle blocks it too. The
/// blocker is still parked (unhydrated) when the projection runs, which is
/// why `is_target_occupied` probes `needs_parse` and not just `formula_cells`.
#[test]
fn bulk_install_spill_collision_with_parked_formula_marks_anchor() {
    let mut wb = installed(
        &[("C1", Value::Number(7.0))],
        &[("A1", "=SEQUENCE(4)"), ("A3", "=C1+1")],
    );

    assert_eq!(cell(&mut wb, "A1"), Value::Error(ValueError::Spill));
    // The blocking formula still evaluates normally.
    assert_eq!(cell(&mut wb, "A3"), Value::Number(8.0));
    assert_eq!(cell(&mut wb, "A2"), Value::Null);
    assert_eq!(cell(&mut wb, "A4"), Value::Null);
}

/// Two bulk-installed anchors whose rectangles overlap resolve
/// deterministically: `formula_source` is row-major, so the earlier anchor
/// spills and the later one collides with the targets it already installed.
/// The payload arrives as a `HashMap`, so without the row-major pass the
/// winner would flip between runs.
///
/// Geometry: B1 spills B1:B2, A2 spills A2:B3 — they share B2, and neither
/// anchor sits inside the other's rectangle (that case is the parked-formula
/// collision above).
#[test]
fn bulk_install_competing_anchors_resolve_row_major() {
    for _ in 0..8 {
        let mut wb = installed(&[], &[("B1", "=SEQUENCE(2)"), ("A2", "=SEQUENCE(2,2)")]);

        match cell(&mut wb, "B1") {
            Value::Array(a) => assert_eq!(a.shape(), (2, 1)),
            other => panic!("B1 (row-major first) must win the spill, got {other:?}"),
        }
        assert_eq!(cell(&mut wb, "B2"), Value::Number(2.0));
        // A2 wanted B2 as a target; B1 got there first.
        assert_eq!(cell(&mut wb, "A2"), Value::Error(ValueError::Spill));
        assert_eq!(cell(&mut wb, "A3"), Value::Null);
        assert_eq!(cell(&mut wb, "B3"), Value::Null);
    }
}

/// Mixed payload: scalar formulas keep working, and they stay lazy. Only the
/// array formula is hydrated by the install-time projection — the
/// storage-primary "no per-cell parse / no dep work at install" contract
/// still holds for everything else (`install_does_zero_dep_work` in
/// `storage_primary_install.rs` pins the all-scalar case).
#[test]
fn bulk_install_mixed_payload_keeps_scalars_lazy() {
    let mut primitives: Vec<(String, Value)> = Vec::new();
    let mut formulas: Vec<(String, String)> = Vec::new();
    for r in 1..=20 {
        primitives.push((format!("A{r}"), Value::Number(r as f64)));
        formulas.push((format!("B{r}"), format!("=A{r}*2")));
    }
    for r in 1..=5 {
        formulas.push((format!("C{r}"), format!("=SUM(A1:A{r})")));
    }
    formulas.push(("E1".into(), "=SEQUENCE(3)".into()));

    let prim_refs: Vec<(&str, Value)> = primitives
        .iter()
        .map(|(a, v)| (a.as_str(), v.clone()))
        .collect();
    let formula_refs: Vec<(&str, &str)> = formulas
        .iter()
        .map(|(a, s)| (a.as_str(), s.as_str()))
        .collect();
    let mut wb = installed(&prim_refs, &formula_refs);

    // Exactly the array formula hydrated at install time.
    assert_eq!(
        wb.sheet(0)
            .expect("sheet 0")
            .debug_dep_graph_stats()
            .formula_count,
        1,
        "only the array formula may hydrate at install time"
    );

    // The array formula spilled.
    assert_eq!(cell(&mut wb, "E2"), Value::Number(2.0));
    assert_eq!(cell(&mut wb, "E3"), Value::Number(3.0));

    // Scalar formulas still evaluate correctly, on demand.
    assert_eq!(cell(&mut wb, "B1"), Value::Number(2.0));
    assert_eq!(cell(&mut wb, "B20"), Value::Number(40.0));
    assert_eq!(cell(&mut wb, "C5"), Value::Number(15.0));

    // Feeder edit still repropagates through a hydrated scalar formula.
    assert!(wb.set_formula(0, "A1", "=10"));
    assert_eq!(cell(&mut wb, "B1"), Value::Number(20.0));
}

/// The whole-workbook variant projects on every sheet, not just the first.
#[test]
fn bulk_install_workbook_projects_every_sheet() {
    let mut wb = Workbook::new();
    wb.add_sheet("Sheet2");

    let mut payload = Vec::new();
    for sheet_idx in 0..2 {
        let mut formulas = HashMap::new();
        formulas.insert(addr("A1"), "=SEQUENCE(3)".to_string());
        payload.push((sheet_idx, HashMap::new(), formulas));
    }
    wb.install_workbook_bulk(payload)
        .expect("install must succeed");

    for name in ["Sheet1", "Sheet2"] {
        assert_eq!(
            wb.get_cell(name, "A2"),
            Value::Number(2.0),
            "{name} spill target A2 must be projected"
        );
        assert_eq!(wb.get_cell(name, "A3"), Value::Number(3.0));
    }
}

/// Re-installing over a sheet that already had a projected spill replaces
/// the geometry instead of leaking the old targets: the teardown clears the
/// spill indexes, and the new payload's anchors are projected fresh.
#[test]
fn bulk_install_replaces_previous_spill_geometry() {
    let mut wb = installed(&[], &[("A1", "=SEQUENCE(5)")]);
    assert_eq!(cell(&mut wb, "A5"), Value::Number(5.0));

    // Second install: shorter array at the same anchor.
    let mut formulas = HashMap::new();
    formulas.insert(addr("A1"), "=SEQUENCE(2)".to_string());
    wb.install_sheet_bulk(0, HashMap::new(), formulas)
        .expect("second install must succeed");

    assert_eq!(cell(&mut wb, "A2"), Value::Number(2.0));
    assert_eq!(
        cell(&mut wb, "A5"),
        Value::Null,
        "the old spill target must not survive the replace"
    );
    assert_eq!(
        wb.sheet(0).expect("sheet 0").spill_info(addr("A1")),
        Some((2, 1))
    );
}

/// A spill over a range of bulk-installed primitives: `=SORT(A1:A4)` reads
/// parked `CellSlot::Plain` values and spills its result. Guards that the
/// install-time evaluation sees the payload it was just handed.
#[test]
fn bulk_install_projects_sort_over_installed_primitives() {
    let mut wb = installed(
        &[
            ("A1", Value::Number(3.0)),
            ("A2", Value::Number(1.0)),
            ("A3", Value::Number(4.0)),
            ("A4", Value::Number(2.0)),
        ],
        &[("C1", "=SORT(A1:A4)")],
    );

    match cell(&mut wb, "C1") {
        Value::Array(a) => {
            assert_eq!(a.shape(), (4, 1));
            assert_eq!(a.get(0, 0), Some(&Value::Number(1.0)));
        }
        other => panic!("expected Array at anchor C1, got {other:?}"),
    }
    assert_eq!(cell(&mut wb, "C2"), Value::Number(2.0));
    assert_eq!(cell(&mut wb, "C3"), Value::Number(3.0));
    assert_eq!(cell(&mut wb, "C4"), Value::Number(4.0));
}
