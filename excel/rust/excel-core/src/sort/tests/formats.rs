use crate::format::CellFormat;
use crate::sheet::Sheet;
use super::asc;
use super::num;
use super::range;



#[test]
fn per_cell_format_moves_with_its_row() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(2.0));
    sheet.set_cell("A2", num(1.0));
    let bold = CellFormat {
        bold: true,
        ..CellFormat::default()
    };
    sheet.set_format("A1", bold.clone());

    sheet.sort_range(range("A1", "A2"), &[asc(0)], &[]).unwrap();
    assert_eq!(sheet.get_format("A2"), bold);
    assert_eq!(sheet.get_format("A1"), CellFormat::default());
}

#[test]
fn layer_intersecting_range_is_materialized_and_cut() {
    let mut sheet = Sheet::new();
    // Data rows 0..2 in col A; keys force row 0 → slot 2.
    sheet.set_cell("A1", num(3.0));
    sheet.set_cell("A2", num(1.0));
    sheet.set_cell("A3", num(2.0));
    let red = CellFormat {
        background: Some("#ff0000".into()),
        ..CellFormat::default()
    };
    // Layer covers row 0 only (A1:B1), extending PAST the range's
    // column span into col B... no — keep it inside rows: layer A1:A1
    // is row 0 of the sorted range; plus an outside strip A5:A6.
    sheet.set_format_range(range("A1", "A1"), red.clone());
    sheet.set_format_range(range("A5", "A6"), red.clone());

    sheet.sort_range(range("A1", "A3"), &[asc(0)], &[]).unwrap();
    // Row 0's red format was materialized and moved with its row to slot 2.
    assert_eq!(sheet.get_format("A3"), red);
    // The new occupants of rows 0/1 are NOT polluted by the old layer.
    assert_eq!(sheet.get_format("A1"), CellFormat::default());
    assert_eq!(sheet.get_format("A2"), CellFormat::default());
    // Untouched layer outside the range still resolves.
    assert_eq!(sheet.get_format("A5"), red);
    assert_eq!(sheet.get_format("A6"), red);
}

#[test]
fn layer_straddling_range_boundary_survives_outside() {
    let mut sheet = Sheet::new();
    // Sort range B2:C4 (rows 1..3, cols 1..2). Layer A1:D5 covers it
    // fully plus a one-cell halo on every side.
    for (i, v) in [3.0, 1.0, 2.0].iter().enumerate() {
        sheet.set_cell(&format!("B{}", i + 2), num(*v));
        sheet.set_cell(&format!("C{}", i + 2), num(*v * 10.0));
    }
    let red = CellFormat {
        background: Some("#f00".into()),
        ..CellFormat::default()
    };
    sheet.set_format_range(range("A1", "D5"), red.clone());

    sheet.sort_range(range("B2", "C4"), &[asc(1)], &[]).unwrap();
    // Inside: every cell was layer-covered → materialized red rides
    // along; all slots still show red.
    for r in 2..=4 {
        assert_eq!(sheet.get_format(&format!("B{r}")), red, "B{r}");
        assert_eq!(sheet.get_format(&format!("C{r}")), red, "C{r}");
    }
    // Outside halo (cut layer pieces): still red.
    for a in ["A1", "B1", "D1", "A3", "D3", "A5", "C5", "D5"] {
        assert_eq!(sheet.get_format(a), red, "{a}");
    }
    // Values moved: col B ascending.
    assert_eq!(sheet.get_cell("B2"), num(1.0));
    assert_eq!(sheet.get_cell("B3"), num(2.0));
    assert_eq!(sheet.get_cell("B4"), num(3.0));
    assert_eq!(sheet.get_cell("C4"), num(30.0));
}

#[test]
fn default_cells_are_not_polluted_by_residual_layers() {
    let mut sheet = Sheet::new();
    // Layer covers ONLY row 1 (A2:B2) inside range A1:B3. Row 1's
    // content moves to slot 0; row 0's default content moves to
    // slot 2 — and must stay default there (no residual layer).
    sheet.set_cell("A1", num(3.0));
    sheet.set_cell("A2", num(1.0));
    sheet.set_cell("A3", num(2.0));
    let red = CellFormat {
        background: Some("#f00".into()),
        ..CellFormat::default()
    };
    sheet.set_format_range(range("A2", "B2"), red.clone());

    sheet.sort_range(range("A1", "B3"), &[asc(0)], &[]).unwrap();
    // Row 1 (key 1) → slot 0: red follows.
    assert_eq!(sheet.get_format("A1"), red);
    assert_eq!(sheet.get_format("B1"), red);
    // Row 2 (key 2) → slot 1: was default, sits where the layer used
    // to be — must NOT inherit red.
    assert_eq!(sheet.get_format("A2"), CellFormat::default());
    // Row 0 (key 3) → slot 2: default stays default.
    assert_eq!(sheet.get_format("A3"), CellFormat::default());
}

#[test]
fn format_snapshot_restores_layer_geometry_exactly() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", num(2.0));
    sheet.set_cell("A2", num(1.0));
    let red = CellFormat {
        background: Some("#f00".into()),
        ..CellFormat::default()
    };
    let bold = CellFormat {
        bold: true,
        ..CellFormat::default()
    };
    sheet.set_format_range(range("A1", "B1"), red.clone());
    sheet.set_format("A2", bold.clone());

    let r = range("A1", "B2");
    let before = sheet.snapshot_format_range(r);
    sheet.sort_range(r, &[asc(0)], &[]).unwrap();
    // Sort mutated the layer set (materialize + cut).
    assert_eq!(sheet.get_format("A2"), red);
    assert_eq!(sheet.get_format("A1"), bold);

    sheet.restore_format_range_snapshot(before.clone());
    // Per-cell entries and layer geometry are back to pre-sort state.
    assert_eq!(sheet.get_format("A1"), red);
    assert_eq!(sheet.get_format("B1"), red);
    assert_eq!(sheet.get_format("A2"), bold);
    let after = sheet.snapshot_format_range(r);
    assert_eq!(after.cell_styles, before.cell_styles);
    assert_eq!(after.row_styles, before.row_styles);
    assert_eq!(after.column_styles, before.column_styles);
}
