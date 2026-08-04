//! 跨表整轴引用：`Sheet2!A:A` / `Sheet2!1:3` 及其 `$` 变体。
//!
//! 故障面曾经精确落在「跨表 + 整轴」这一个交点上：同表整轴 `A:A` 正常、
//! 跨表有界 `Sheet2!A1:A5` 正常，唯独两者相交时全线 `#VALUE!`。根因在
//! **解析器**而不是求值器 —— `identifier` 的 `!` 分支只认 `[$]列[$]行` 这
//! 一种右尾，整轴那两种角（只有列字母 / 只有行数字）扫不出来就让整条公式
//! 解析失败，`#VALUE!` 是「公式没解析成」的通用码，不是求值器算出来的。
//!
//! 因此本套用例的断言重心是**跨表整轴与同表整轴逐格同值**：修法是让跨表
//! 复用同表那三个扫描器，任何一侧单独漂移都应该在这里断。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

/// Sheet1（公式所在表）+ Sheet2 + Sheet3。Sheet1 的 C 列刻意与 Sheet2 的
/// A 列同形，用来做「同表整轴 vs 跨表整轴」的逐条对照。
fn fixture() -> Workbook {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Sheet2");
    wb.sheet_mut(s2).unwrap().set_cell("A1", Value::Number(1.0));
    wb.sheet_mut(s2).unwrap().set_cell("A3", Value::Number(3.0));
    wb.sheet_mut(s2)
        .unwrap()
        .set_cell("B1", Value::Number(100.0));
    wb.sheet_mut(s2)
        .unwrap()
        .set_cell("B3", Value::Number(300.0));
    wb.sheet_mut(s2)
        .unwrap()
        .set_cell("B5", Value::Number(500.0));
    let s3 = wb.add_sheet("Sheet3");
    wb.sheet_mut(s3).unwrap().set_cell("A1", Value::Number(7.0));
    wb.sheet_mut(s3).unwrap().set_cell("A2", Value::Number(9.0));
    // Sheet1 的同形对照列。
    wb.sheet_mut(0).unwrap().set_cell("C1", Value::Number(1.0));
    wb.sheet_mut(0).unwrap().set_cell("C3", Value::Number(3.0));
    wb.sheet_mut(0)
        .unwrap()
        .set_cell("D1", Value::Number(100.0));
    wb.sheet_mut(0)
        .unwrap()
        .set_cell("D3", Value::Number(300.0));
    wb.sheet_mut(0)
        .unwrap()
        .set_cell("D5", Value::Number(500.0));
    wb
}

/// 在 Sheet1!E1 装一条公式并取值。
fn eval(formula: &str) -> Value {
    let mut wb = fixture();
    wb.set_formula(0, "E1", formula);
    wb.get_cell("Sheet1", "E1")
}

/// 复现用例本身：报障的六条公式，闭式字面量断言。
#[test]
fn cross_sheet_whole_axis_aggregates_match_excel() {
    assert_eq!(eval("=SUM(Sheet2!A:A)"), Value::Number(4.0));
    assert_eq!(eval("=COUNT(Sheet2!A:A)"), Value::Number(2.0));
    assert_eq!(eval("=COUNTA(Sheet2!A:A)"), Value::Number(2.0));
    assert_eq!(eval("=MAX(Sheet2!A:A)"), Value::Number(3.0));
    assert_eq!(eval("=AVERAGE(Sheet2!A:A)"), Value::Number(2.0));
    // 整行：Sheet2 第 1 行是 A1=1 + B1=100。
    assert_eq!(eval("=SUM(Sheet2!1:1)"), Value::Number(101.0));
}

/// `COUNTBLANK` 要的是**矩形基数**，不只是「别报错」：夹取之后仍须能算出
/// 1048576 − 2。这条是 `bounded_shape()` 的网格夹取真的生效了的证据 ——
/// 哨兵 `u32::MAX` 没夹住的话这里会溢出或给出天文数字。
#[test]
fn cross_sheet_whole_axis_countblank_keeps_rectangle_cardinality() {
    assert_eq!(eval("=COUNTBLANK(Sheet2!A:A)"), Value::Number(1_048_574.0));
    // 整行同理：16384 − 2（A1、B1 被占）。
    assert_eq!(eval("=COUNTBLANK(Sheet2!1:1)"), Value::Number(16_382.0));
    // 同表整轴的对照值，两侧必须同口径。
    assert_eq!(eval("=COUNTBLANK(C:C)"), Value::Number(1_048_574.0));
}

/// 两个对照面：同表整轴、跨表有界。它们在修复前就是对的，修复不能碰坏。
#[test]
fn same_sheet_whole_axis_and_bounded_cross_sheet_controls_hold() {
    assert_eq!(eval("=SUM(C:C)"), Value::Number(4.0));
    assert_eq!(eval("=SUM(Sheet2!A1:A5)"), Value::Number(4.0));
}

/// 多轴：跨表整列区间 `A:C`、跨表整行区间 `1:3`。
#[test]
fn cross_sheet_multi_axis_bands_resolve() {
    // A 列 4 + B 列 900，C 列空。
    assert_eq!(eval("=SUM(Sheet2!A:C)"), Value::Number(904.0));
    // 第 1..3 行覆盖同样四个格子。
    assert_eq!(eval("=SUM(Sheet2!1:3)"), Value::Number(404.0));
    assert_eq!(eval("=COUNT(Sheet2!A:C)"), Value::Number(5.0));
}

/// `$` 变体。绝对性只是写法标注，取值必须与相对形式逐字相同。
#[test]
fn cross_sheet_whole_axis_absolute_forms_match_relative() {
    assert_eq!(eval("=SUM(Sheet2!$A:$A)"), Value::Number(4.0));
    assert_eq!(eval("=SUM(Sheet2!A:$A)"), Value::Number(4.0));
    assert_eq!(eval("=SUM(Sheet2!$1:$1)"), Value::Number(101.0));
    assert_eq!(eval("=SUM(Sheet2!$A:$C)"), Value::Number(904.0));
}

/// 跨表整轴出现在聚合以外的位置。
#[test]
fn cross_sheet_whole_axis_in_other_argument_positions() {
    assert_eq!(eval("=COUNTIF(Sheet2!A:A,\">1\")"), Value::Number(1.0));
    assert_eq!(eval("=COUNTIFS(Sheet2!A:A,\">1\")"), Value::Number(1.0));
    // INDEX / MATCH 数的是区域内**绝对位置**，空格照样占一格。
    assert_eq!(eval("=INDEX(Sheet2!A:A,3)"), Value::Number(3.0));
    assert_eq!(eval("=MATCH(3,Sheet2!A:A,0)"), Value::Number(3.0));
    // 二参 SUMIF（无 sum_range）。
    assert_eq!(eval("=SUMIF(Sheet2!A:A,\">1\")"), Value::Number(3.0));
    // 动态右角：左角是跨表单格，右角由 INDEX 在跨表整轴上算出来。
    assert_eq!(
        eval("=SUM(Sheet2!A1:INDEX(Sheet2!A:A,3))"),
        Value::Number(4.0)
    );
    // 两条跨表整轴参与算术。
    assert_eq!(
        eval("=SUM(Sheet2!A:A)+SUM(Sheet2!B:B)"),
        Value::Number(904.0)
    );
}

/// 三表链：Sheet1 的公式引用 Sheet3 的整轴，与引用 Sheet2 无差别。
#[test]
fn third_sheet_whole_axis_resolves_from_first_sheet() {
    assert_eq!(eval("=SUM(Sheet3!A:A)"), Value::Number(16.0));
    assert_eq!(
        eval("=SUM(Sheet2!A:A)+SUM(Sheet3!A:A)"),
        Value::Number(20.0)
    );
}

/// 不存在的表名：整轴与单格必须给**同一个**码，且与 TS 参考引擎对齐 ——
/// 两边都是 `#REF!`（TS 侧 `runtime-ref-read.ts` 的 `crossSheetCells`
/// 取不到表时返回 `#REF!`，单格走 `evaluate` 的 `crossSheet` 臂同码）。
/// 修复前整轴给的是 `#VALUE!`，那是「没解析成」而不是「表不存在」。
#[test]
fn missing_sheet_whole_axis_is_invalid_ref_like_single_cell() {
    assert_eq!(
        eval("=SUM(NoSuch!A:A)"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(
        eval("=SUM(NoSuch!A1)"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(
        eval("=SUM(NoSuch!1:1)"),
        Value::Error(ValueError::InvalidRef)
    );
}

/// 整轴作为 `VLOOKUP` / `XLOOKUP` / `HLOOKUP` 的范围实参必须走稀疏裁剪，
/// 且跨表与同表保持同一结果。`HLOOKUP` 的表区写成整列带 `C:D` / `A:B`：
/// 第一行找键，第三行取值，证明它不会因 1048576 行的尾空格而拒收。
#[test]
fn whole_axis_in_lookups_match_cross_sheet_and_same_sheet() {
    for (same, cross) in [
        ("=VLOOKUP(3,C:D,2,FALSE)", "=VLOOKUP(3,Sheet2!A:B,2,FALSE)"),
        ("=XLOOKUP(3,C:C,D:D)", "=XLOOKUP(3,Sheet2!A:A,Sheet2!B:B)"),
        (
            "=HLOOKUP(100,C:D,3,FALSE)",
            "=HLOOKUP(100,Sheet2!A:B,3,FALSE)",
        ),
    ] {
        assert_eq!(
            eval(same),
            Value::Number(300.0),
            "same-sheet baseline changed: {same}"
        );
        assert_eq!(
            eval(cross),
            Value::Number(300.0),
            "cross-sheet must match the same-sheet verdict: {cross}"
        );
    }
    // 返回列比查找列多一条尾数据时，两条整列仍是等长的 Excel 区域；
    // XLOOKUP 必须共享稀疏裁剪后的高度，不能各自裁完再误报长度不等。
    assert_eq!(eval("=XLOOKUP(1,C:C,D:D)"), Value::Number(100.0));
    assert_eq!(
        eval("=XLOOKUP(1,Sheet2!A:A,Sheet2!B:B)"),
        Value::Number(100.0)
    );
    // 有界跨表 VLOOKUP 照常可用。
    assert_eq!(
        eval("=VLOOKUP(3,Sheet2!A1:B3,2,FALSE)"),
        Value::Number(300.0)
    );
}

/// 本表的结构性编辑**不移动**跨表引用 —— 整轴形态也一样。
///
/// 这条守的是解析器打通后新暴露出来的一面：`Sheet2!A:A` 以前解析不出来，
/// 停泊态文本重写器怎么改它都无所谓（反正 hydrate 出 `#VALUE!`）；现在它
/// 是合法公式了，重写器把 `A:A` 当同表整列平移就会静默改错表的引用。
/// 整行 `Sheet2!1:3` 以数字开头，曾经连 `!` 守卫都走不到。
#[test]
fn within_sheet_structural_edit_does_not_shift_cross_sheet_whole_axis() {
    // 插列：Sheet1 的同表整轴跟着走，跨表整轴钉死。
    let mut wb = fixture();
    wb.set_formula(0, "E1", "=SUM(Sheet2!A:A)");
    wb.set_formula(0, "E2", "=SUM(C:C)");
    wb.set_formula(0, "E3", "=SUM(Sheet2!1:1)");
    wb.insert_columns(0, 0, 1);
    // Sheet2 没被动过，跨表整轴的答案不变。
    assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(4.0));
    assert_eq!(wb.get_cell("Sheet1", "F3"), Value::Number(101.0));
    // 同表整列被插列推着走，仍指向原来那列数据。
    assert_eq!(wb.get_cell("Sheet1", "F2"), Value::Number(4.0));

    // 插行：跨表整行不该被推成 `2:2`。
    let mut wb = fixture();
    wb.set_formula(0, "E1", "=SUM(Sheet2!1:1)");
    wb.set_formula(0, "E2", "=SUM(Sheet2!A:A)");
    wb.insert_rows(0, 0, 1);
    assert_eq!(wb.get_cell("Sheet1", "E2"), Value::Number(101.0));
    assert_eq!(wb.get_cell("Sheet1", "E3"), Value::Number(4.0));
}

/// 删掉本表的第一列不该把跨表整轴打成 `#REF!` —— 它根本不在本表的坐标系里。
#[test]
fn within_sheet_delete_does_not_kill_cross_sheet_whole_axis() {
    let mut wb = fixture();
    wb.set_formula(0, "E1", "=SUM(Sheet2!A:A)");
    wb.set_formula(0, "E2", "=SUM(Sheet2!1:1)");
    wb.delete_columns(0, 0, 1);
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(4.0));
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(101.0));
}

/// 写回文本的往返：`render_formula` 早就认得 `SheetRange` 的 `unbounded`
/// 判别位（`render_range_body` 的 `Rows` / `Cols` 两臂），修复前只是没有
/// 解析器能造出这种节点。`FORMULATEXT` 读回来的应当仍是整轴写法。
#[test]
fn cross_sheet_whole_axis_round_trips_through_formula_text() {
    for src in [
        "=SUM(Sheet2!A:A)",
        "=SUM(Sheet2!$A:$C)",
        "=SUM(Sheet2!1:3)",
        "=SUM(Sheet2!$1:$3)",
    ] {
        let mut wb = fixture();
        wb.set_formula(0, "E1", src);
        wb.set_formula(0, "F1", "=FORMULATEXT(E1)");
        assert_eq!(
            wb.get_cell("Sheet1", "F1"),
            Value::Text(src.to_string()),
            "formula text must round-trip: {src}"
        );
    }
}
