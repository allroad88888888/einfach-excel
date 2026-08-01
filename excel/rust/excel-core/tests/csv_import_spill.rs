//! Dynamic-array (spill) projection through the CSV import path
//! (`import_csv` → `Sheet::bulk_load`).
//!
//! 第四条批量入口。前三条（`bulk_install_workbook`、`WorkbookLoader::flush`、
//! 跨表数组重投影）的投影尾在 ADR 0006 那批里补齐了，覆盖在
//! `bulk_install_spill.rs` / `bulk_load_spill.rs` / `bulk_install_spill_cross_sheet.rs`；
//! CSV 走的是 `Sheet::bulk_load`，与那三条都不重合，所以单独钉在这里。
//!
//! 缺投影尾的用户可见症状是同一个：导进来的动态数组只剩锚点，其余目标格全空。
//!
//! 读锚点的口径：`Sheet` 这一层锚点持有的就是 `Value::Array` 本身
//! （塌缩成左上角标量发生在 WASM 边界），所以下面一律用 `spill_info` /
//! `spill_anchor_for` 查几何，用非锚点目标格查投影出来的标量。

use einfach_core::{Value, ValueError};
use einfach_excel_core::{import_csv, CellAddress, Sheet};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
}

/// 锚点在 `Sheet` 层持有整个数组；断言形状与逐个元素。
fn assert_anchor_holds(sheet: &Sheet, cell: &str, want: &[f64]) {
    match sheet.get_cell(cell) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (want.len() as u32, 1), "anchor {cell} shape");
            for (i, n) in want.iter().enumerate() {
                assert_eq!(
                    arr.get(i as u32, 0).cloned(),
                    Some(Value::Number(*n)),
                    "anchor {cell} element {i}"
                );
            }
        }
        other => panic!("anchor {cell} must hold an Array, got {other:?}"),
    }
}

/// 基本形态：一份含 `=SEQUENCE(3)` 的 CSV 导进来，锚点要拥有整块矩形，
/// 不能只剩 H2 一个值、H3..H4 全空。
#[test]
fn import_csv_projects_dynamic_array_formula() {
    let mut sheet = Sheet::new();
    import_csv(&mut sheet, "label,=SEQUENCE(3)\n", addr("G2"));

    assert_eq!(sheet.get_cell("G2"), Value::Text("label".into()));
    assert_eq!(
        sheet.spill_info(addr("H2")),
        Some((3, 1)),
        "imported =SEQUENCE(3) must own a 3x1 rectangle"
    );
    assert_anchor_holds(&sheet, "H2", &[1.0, 2.0, 3.0]);
    assert_eq!(sheet.get_cell("H3"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("H4"), Value::Number(3.0));
    assert_eq!(sheet.spill_anchor_for(addr("H4")), Some(addr("H2")));
}

/// 二维形态 + 引用同一份 CSV 里刚落地的字面量：投影必须对着导入**后**的
/// 世界算，而不是对着导入前的空表。
#[test]
fn import_csv_projects_array_reading_imported_literals() {
    let mut sheet = Sheet::new();
    import_csv(&mut sheet, "3\n1\n2\n=SORT(A1:A3)\n", addr("A1"));

    assert_eq!(
        sheet.spill_info(addr("A4")),
        Some((3, 1)),
        "=SORT over literals imported in the same CSV must spill"
    );
    assert_anchor_holds(&sheet, "A4", &[1.0, 2.0, 3.0]);
    assert_eq!(sheet.get_cell("A5"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("A6"), Value::Number(3.0));
}

/// 碰撞形态：CSV 里的字面量挡住了同一份 CSV 里数组的落点。Excel 语义是
/// 锚点变 `#SPILL!`、阻塞物保留；投影尾要在导入时就判出来，而不是等到
/// 第一次读或下一次写入。
#[test]
fn import_csv_reports_spill_collision_against_imported_literal() {
    let mut sheet = Sheet::new();
    import_csv(&mut sheet, "=SEQUENCE(3)\nblocker\n", addr("C1"));

    assert_eq!(
        sheet.get_cell("C1"),
        Value::Error(ValueError::Spill),
        "an imported literal inside the target rectangle must block the spill"
    );
    assert_eq!(sheet.get_cell("C2"), Value::Text("blocker".into()));
    assert_eq!(sheet.spill_info(addr("C1")), None);
}

/// 行主序仲裁：两块矩形相交、且**谁也没坐在对方的锚点上**时，赢家必须是
/// 行主序靠前的那个。这是 `project_bulk_spill_anchors` 排序契约的可观测面 ——
/// 顺序若由 CSV 解析顺序或任何 hash 序决定，这条会翻。
///
/// 形状：B1 向下铺 B1:B3，A2 向右铺 A2:C2，只在 B2 相交。
#[test]
fn import_csv_spill_arbitration_is_row_major() {
    let mut sheet = Sheet::new();
    // 第一行 A1 留空、B1 放竖向数组；第二行 A2 放横向数组（带逗号，
    // 必须整字段加引号，否则会被 CSV 当成两个字段切开）。
    import_csv(&mut sheet, ",=SEQUENCE(3)\n\"=SEQUENCE(1,3)\"\n", addr("A1"));

    assert_eq!(
        sheet.spill_info(addr("B1")),
        Some((3, 1)),
        "row-major-first anchor wins the contended cell"
    );
    assert_eq!(sheet.get_cell("B2"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("B3"), Value::Number(3.0));
    assert_eq!(sheet.spill_anchor_for(addr("B2")), Some(addr("B1")));
    assert_eq!(
        sheet.get_cell("A2"),
        Value::Error(ValueError::Spill),
        "the row-major-later anchor must report #SPILL!"
    );
    assert_eq!(sheet.get_cell("C2"), Value::Null, "loser projects nothing");
}

/// 阻塞形态的另一半：后一个锚点正好坐在前一个的投影格里。此时前者被后者
/// 停放的公式挡住变 `#SPILL!`，后者照常铺开 —— 与 Excel 一致，且证明碰撞
/// 判定看得见**停放但未解析**的公式，不是只看已求值的格子。
#[test]
fn import_csv_anchor_parked_inside_another_rectangle_blocks_it() {
    let mut sheet = Sheet::new();
    import_csv(&mut sheet, "=SEQUENCE(3)\n=SEQUENCE(3)\n", addr("E1"));

    assert_eq!(sheet.get_cell("E1"), Value::Error(ValueError::Spill));
    assert_eq!(sheet.spill_info(addr("E1")), None);
    assert_eq!(
        sheet.spill_info(addr("E2")),
        Some((3, 1)),
        "the blocking anchor itself still spills"
    );
    assert_eq!(sheet.get_cell("E3"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("E4"), Value::Number(3.0));
}

/// 回归护栏：不产数组的普通公式导入后不得凭空长出 spill 几何，
/// 投影尾的候选闸门（`source_may_produce_array` + `expr_may_produce_array`）
/// 不能放宽。
#[test]
fn import_csv_leaves_scalar_formulas_without_spill_geometry() {
    let mut sheet = Sheet::new();
    import_csv(&mut sheet, "10,20,=A1+B1\n", addr("A1"));

    assert_eq!(sheet.get_cell("C1"), Value::Number(30.0));
    assert_eq!(sheet.spill_info(addr("C1")), None);
    assert_eq!(sheet.spill_anchor_for(addr("C1")), None);
}

/// 解析失败的公式字段不得进候选集：它已被写成 `#VALUE!`，再去投影会在
/// `recompute_array_formula` 里白跑一趟。行为断言 = 该格是 `#VALUE!` 且
/// 无几何，同一份 CSV 里真正的数组不受牵连。
#[test]
fn import_csv_unparseable_formula_is_not_a_spill_candidate() {
    let mut sheet = Sheet::new();
    import_csv(&mut sheet, "=SEQUENCE(,\n=SEQUENCE(2)\n", addr("A1"));

    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::InvalidValue));
    assert_eq!(sheet.spill_info(addr("A1")), None);
    assert_eq!(sheet.spill_info(addr("A2")), Some((2, 1)));
    assert_eq!(sheet.get_cell("A3"), Value::Number(2.0));
}
