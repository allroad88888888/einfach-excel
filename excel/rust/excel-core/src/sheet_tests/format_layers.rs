//! 单元格格式与区域格式两层的叠加、快照与通知。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === Phase 6 — cell format tests ===

#[test]
fn set_get_format_roundtrip() {
    use crate::format::{Align, NumberFormat};
    let mut sheet = Sheet::new();
    let fmt = CellFormat {
        number_format: NumberFormat::Percent { digits: 0 },
        bold: true,
        align: Align::Center,
        ..Default::default()
    };
    sheet.set_format("A1", fmt.clone());
    assert_eq!(sheet.get_format("A1"), fmt);
    // Unset cells return default.
    assert_eq!(sheet.get_format("B2"), CellFormat::default());
    // Setting default removes the entry.
    sheet.set_format("A1", CellFormat::default());
    assert_eq!(sheet.get_format("A1"), CellFormat::default());
}

#[test]
fn range_format_applies_to_empty_cells() {
    use crate::format::{Align, NumberFormat};

    let mut sheet = Sheet::new();
    let fmt = CellFormat {
        number_format: NumberFormat::Decimal {
            digits: 2,
            thousands: true,
        },
        bold: true,
        align: Align::Center,
        ..Default::default()
    };
    let updated = sheet.set_format_range(
        CellRange::new(CellAddress::new(1, 1), CellAddress::new(3, 3)),
        fmt.clone(),
    );
    assert_eq!(updated, 0);
    assert_eq!(sheet.get_format("B2"), fmt);
    assert_eq!(sheet.get_format("C4"), fmt);
    assert_eq!(sheet.get_format("A1"), CellFormat::default());
}

#[test]
fn range_format_is_overridden_by_cell_format() {
    use crate::format::NumberFormat;

    let mut sheet = Sheet::new();
    sheet.set_format(
        "B2",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );

    sheet.set_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 4)),
        CellFormat {
            italic: true,
            ..Default::default()
        },
    );
    // Existing per-cell overrides inside the range are cleared when the
    // range layer is applied.
    assert_eq!(
        sheet.get_format("B2"),
        CellFormat {
            italic: true,
            ..Default::default()
        }
    );

    sheet.set_format(
        "B2",
        CellFormat {
            number_format: NumberFormat::Percent { digits: 0 },
            ..Default::default()
        },
    );
    assert_eq!(
        sheet.get_format("B2"),
        CellFormat {
            number_format: NumberFormat::Percent { digits: 0 },
            ..Default::default()
        }
    );
}

#[test]
fn range_format_does_not_change_value_density() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    let before = sheet.non_empty_addrs().len();

    let updated = sheet.set_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(99_999, 99_999)),
        CellFormat {
            italic: true,
            ..Default::default()
        },
    );

    assert_eq!(sheet.non_empty_addrs().len(), before);
    assert_eq!(sheet.get_cell("A1"), Value::Number(1.0));
    assert_eq!(updated, 0);
}

#[test]
fn range_format_snapshot_restore_preserves_sparse_metadata() {
    let mut sheet = Sheet::new();
    sheet.set_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 2)),
        CellFormat {
            italic: true,
            ..Default::default()
        },
    );
    sheet.set_format(
        "B2",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    sheet.set_format(
        "E5",
        CellFormat {
            font_size: Some(18),
            ..Default::default()
        },
    );

    let snapshot = sheet.snapshot_format_range(CellRange::new(
        CellAddress::new(0, 0),
        CellAddress::new(3, 3),
    ));
    sheet.set_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(3, 3)),
        CellFormat {
            background: Some("#ffeeaa".into()),
            ..Default::default()
        },
    );
    assert_eq!(
        sheet.get_format("B2"),
        CellFormat {
            background: Some("#ffeeaa".into()),
            ..Default::default()
        }
    );

    assert_eq!(sheet.restore_format_range_snapshot(snapshot), 0);
    assert_eq!(
        sheet.get_format("A1"),
        CellFormat {
            italic: true,
            ..Default::default()
        }
    );
    assert_eq!(
        sheet.get_format("B2"),
        CellFormat {
            bold: true,
            ..Default::default()
        }
    );
    assert_eq!(sheet.get_format("D4"), CellFormat::default());
    assert_eq!(
        sheet.get_format("E5"),
        CellFormat {
            font_size: Some(18),
            ..Default::default()
        }
    );
}

#[test]
fn range_format_notifies_only_subscribed_addresses() {
    use std::cell::Cell;
    use std::rc::Rc;
    let mut sheet = Sheet::new();
    let a = Rc::new(Cell::new(0u32));
    let b = Rc::new(Cell::new(0u32));

    let a2 = Rc::clone(&a);
    let b2 = Rc::clone(&b);
    let _sub_a = sheet.subscribe_cell("A1", move || a2.set(a2.get() + 1));
    let _sub_b = sheet.subscribe_cell("D4", move || b2.set(b2.get() + 1));

    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(3, 3));
    let notified = sheet.set_format_range(
        range,
        CellFormat {
            italic: true,
            ..Default::default()
        },
    );

    assert_eq!(a.get(), 1);
    assert_eq!(b.get(), 1);
    assert_eq!(notified, 2);

    let c = Rc::new(Cell::new(0u32));
    let c2 = Rc::clone(&c);
    let _sub_c = sheet.subscribe_cell("E5", move || c2.set(c2.get() + 1));
    let notified = sheet.set_format_range(
        range,
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    assert_eq!(c.get(), 0);
    assert_eq!(notified, 2);
}
