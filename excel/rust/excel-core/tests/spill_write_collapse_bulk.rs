//! ADR 0006 阶段 1 在**批量路径**上的同一套语义。
//!
//! 单格写入的语义面在兄弟文件 `spill_write_collapse.rs`。分开的理由是失败时
//! 要回答的问题不同：那边问「语义对不对」，这边问「批量路径有没有绕过语义」。
//! `BulkLoader` 曾经静默跳过投影格 —— 带成功计数的丢数据 —— 而且它够不到
//! Store 反向依赖，所以 anchor 的 `#SPILL!` 必须由 `flush` 送达。
//!
//! 契约见 `docs/decisions/0006-spill-region-write-semantics.md`。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

mod spill_write_support;
use spill_write_support::{assert_collapsed, column_spill_sheet, range};

// =====================================================================
// Stage 1 — the bulk paths
// =====================================================================

/// `BulkLoader::set_cell` used to skip a projection cell silently. It now
/// collapses, and the anchor's `#SPILL!` is delivered by `flush` — the bulk
/// path cannot reach the anchor through Store reverse dependencies either.
#[test]
fn bulk_literal_into_projection_cell_collapses_at_flush() {
    let mut sheet = column_spill_sheet();

    sheet.bulk_load(|loader| {
        loader.set_cell("H3", Value::Number(7.0));
    });

    assert_eq!(sheet.get_cell("H3"), Value::Number(7.0));
    assert_collapsed(&sheet, "H1", &["H2", "H4"]);
}

/// Same for `BulkLoader::set_formula`, which also has to start returning
/// `true`: the formula really is installed now.
#[test]
fn bulk_formula_into_projection_cell_installs_and_collapses() {
    let mut sheet = column_spill_sheet();

    let installed = sheet.bulk_load(|loader| loader.set_formula("H3", "=1+1"));

    assert!(installed, "the formula is installed, not rejected");
    assert_eq!(sheet.get_cell("H3"), Value::Number(2.0));
    assert_collapsed(&sheet, "H1", &["H2", "H4"]);
}

/// `Workbook::bulk_load` reaches `set_formula_lazy` through
/// `set_formula_pre_parsed`, a third entry point with its own copy of the
/// guard. Leaving it un-collapsed is what would have made `store.set` panic on
/// a read-only derived atom.
#[test]
fn workbook_bulk_load_formula_into_projection_cell_collapses() {
    let mut wb = Workbook::new();
    assert!(wb.set_formula(0, "H1", "=SEQUENCE(4)"));
    assert_eq!(wb.get_cell("Sheet1", "H3"), Value::Number(3.0));

    wb.bulk_load(|loader| {
        loader.set_formula(0, "H3", "=1+1");
    });

    assert_eq!(wb.get_cell("Sheet1", "H3"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "H1"), Value::Error(ValueError::Spill));
    assert_eq!(wb.get_cell("Sheet1", "H2"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "H4"), Value::Null);
}

/// `clear_range` over part of a spill region routes through
/// `BulkLoader::set_cell_at` with `Value::Null`, so it inherits the inert
/// Delete rule: plain cells clear, the array survives. The count still
/// reports every non-empty address the sparse scan VISITED, which at the
/// Rust layer includes projection cells.
#[test]
fn clear_range_over_part_of_a_spill_leaves_the_array_intact() {
    let mut sheet = column_spill_sheet();
    sheet.set_cell("I3", Value::Number(99.0));

    sheet.clear_range(range("H3", "I3"));

    assert_eq!(sheet.get_cell("I3"), Value::Null, "plain cell cleared");
    assert_eq!(sheet.get_cell("H3"), Value::Number(3.0), "array intact");
    assert!(matches!(sheet.get_cell("H1"), Value::Array(_)));
}

/// But a range that clears the ANCHOR still tears everything down, and the
/// region is writable afterwards.
#[test]
fn clear_range_over_the_anchor_still_tears_the_spill_down() {
    let mut sheet = column_spill_sheet();

    sheet.clear_range(range("H1", "H4"));

    for a in ["H1", "H2", "H3", "H4"] {
        assert_eq!(sheet.get_cell(a), Value::Null, "{a} must be empty");
    }
    assert!(sheet.try_set_cell("H3", Value::Number(5.0)).is_ok());
    assert_eq!(sheet.get_cell("H3"), Value::Number(5.0));
}
