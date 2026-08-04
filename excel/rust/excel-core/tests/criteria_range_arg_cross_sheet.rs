//! 区域实参的解析口径：跨表 / 动态区域必须与同表**逐条同值**。
//!
//! 故障面：`SUMIF` 三参分支自己 `match Expr::Range` 取条件区与求和区，
//! `Expr::SheetRange` 与所有动态区域节点（`OFFSET` / `INDIRECT` / `INDEX`）
//! 都掉进 `_` 回退 —— 而那条回退把「求和区」当**不存在**，加的是条件区自己的
//! 值。于是 `=SUMIF(Sheet2!A1:A3,">1",Sheet2!B1:B3)` 答 5 而不是 500：
//! 一个看着完全合理的数，比 `#VALUE!` 难发现得多。整轴无关 —— 有界跨表同错。
//!
//! 修法是让两个区域实参都走 `runtime_ref_from_expr` / `resolve_range_arg`
//! 这一条**唯一**入口（`AVERAGEIF` / `*IFS` / `D*` 一族早就在用），取格由
//! `fetch_range_cell` 按 `sheet` 派给 `sheet_cell` / `cell`。因此本套用例的
//! 断言重心是「跨表 = 同表 = 动态区域」的三方同值：任何一侧单独漂移都应在
//! 这里断，而不是等到用户发现总账对不上。
//!
//! 顺带钉住同形状的第二处：`OFFSET` 的锚点也只认 `Expr::CellRef`，
//! `OFFSET(Sheet2!A1,…)` 给 `#REF!`，套进 `COUNTIF` 更是静默答 0。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

/// Sheet1（公式所在表）与 Sheet2 的 A/B 两列刻意**同形同值**，用来做
/// 「同表 vs 跨表」的逐条对照；Sheet3 提供第三张表，验证求和区可以落在
/// 与条件区**都不同**的表上。
///
/// 三条刻意的不规则：`Sheet2!C2` 空（稀疏遍历下的位置对齐）、`Sheet2!E2`
/// 是错误格（值档要传播）、`Sheet2!F1` 是错误格（条件档不短路）。
fn fixture() -> Workbook {
    let mut wb = Workbook::new();
    seed_numbers(wb.sheet_mut(0).unwrap());
    let s2 = wb.add_sheet("Sheet2");
    let s = wb.sheet_mut(s2).unwrap();
    seed_numbers(s);
    // C 列稀疏：C2 没有格子。
    s.set_cell("C1", Value::Number(10.0));
    s.set_cell("C3", Value::Number(30.0));
    // D 列：与 A 列的列距是 3，验证列偏移不只对 +1 成立。
    s.set_cell("D1", Value::Number(1000.0));
    s.set_cell("D2", Value::Number(2000.0));
    s.set_cell("D3", Value::Number(3000.0));
    // E 列：值档里的错误格。
    s.set_cell("E2", Value::Error(ValueError::DivisionByZero));
    // F 列：条件档里的错误格。
    s.set_cell("F1", Value::Error(ValueError::DivisionByZero));
    s.set_cell("F2", Value::Number(20.0));
    s.set_cell("F3", Value::Number(30.0));
    let s3 = wb.add_sheet("Sheet3");
    let s = wb.sheet_mut(s3).unwrap();
    s.set_cell("B1", Value::Number(7.0));
    s.set_cell("B2", Value::Number(8.0));
    s.set_cell("B3", Value::Number(9.0));
    wb
}

fn seed_numbers(s: &mut einfach_excel_core::Sheet) {
    s.set_cell("A1", Value::Number(1.0));
    s.set_cell("A2", Value::Number(2.0));
    s.set_cell("A3", Value::Number(3.0));
    s.set_cell("B1", Value::Number(100.0));
    s.set_cell("B2", Value::Number(200.0));
    s.set_cell("B3", Value::Number(300.0));
}

/// 在 Sheet1!H1 装一条公式并取值（H 列与夹具的 A..F 不重叠）。
fn eval(formula: &str) -> Value {
    let mut wb = fixture();
    wb.set_formula(0, "H1", formula);
    wb.get_cell("Sheet1", "H1")
}

fn num(formula: &str) -> f64 {
    match eval(formula) {
        Value::Number(n) => n,
        other => panic!("{formula} → {other:?}，期望数字"),
    }
}

/// 复现用例本身。条件 `">1"` 命中 A2=2、A3=3，两行的求和区格子是
/// B2=200 与 B3=300 → 500。修复前答 **5**（= 2 + 3，即条件区自己的值）。
#[test]
fn sumif_three_arg_cross_sheet_sums_the_sum_range() {
    assert_eq!(num("=SUMIF(Sheet2!A1:A3,\">1\",Sheet2!B1:B3)"), 500.0);
    // 同表对照：修复前就是对的，修复不能碰坏。
    assert_eq!(num("=SUMIF(A1:A3,\">1\",B1:B3)"), 500.0);
}

/// 两侧不必同表。条件区与求和区各自独立带表限定，混搭三种都成立。
#[test]
fn sumif_three_arg_mixes_sheets_on_either_side() {
    // 条件区在本表、求和区跨表。
    assert_eq!(num("=SUMIF(A1:A3,\">1\",Sheet2!B1:B3)"), 500.0);
    // 条件区跨表、求和区在本表。
    assert_eq!(num("=SUMIF(Sheet2!A1:A3,\">1\",B1:B3)"), 500.0);
    // 两侧各在**不同的**第三方表上：命中行取 Sheet3!B2=8 与 B3=9 → 17。
    assert_eq!(num("=SUMIF(Sheet2!A1:A3,\">1\",Sheet3!B1:B3)"), 17.0);
    // 列距不是 1：A 列到 D 列差 3 列 → D2+D3 = 5000。
    assert_eq!(num("=SUMIF(Sheet2!A1:A3,\">1\",Sheet2!D1:D3)"), 5000.0);
}

/// Excel 的对齐规则是「求和区**左上角** + 条件区形状」，求和区自己的行列数
/// 不参与。同一条件区配三种形状的求和区（单格 / 更长 / 更短）必须**同值**。
///
/// 单格那条尤其要钉死：`Sheet2!B1` 是 `Expr::SheetRef` 而不是 `SheetRange`，
/// 走的是与区域不同的 AST 节点，最容易再漏。
#[test]
fn sumif_sum_range_uses_top_left_plus_criteria_shape() {
    for sum_range in ["B1:B3", "B1", "B1:B10", "B1:B2"] {
        assert_eq!(
            num(&format!("=SUMIF(A1:A3,\">1\",{sum_range})")),
            500.0,
            "同表 sum_range={sum_range}"
        );
        assert_eq!(
            num(&format!("=SUMIF(Sheet2!A1:A3,\">1\",Sheet2!{sum_range})")),
            500.0,
            "跨表 sum_range={sum_range}"
        );
    }
}

/// 平移的原点是**条件区的左上角**，不是表的原点。条件区 `A2:A3` 配求和区
/// 左上角 `B1` → 命中 A2 取 B1=100、命中 A3 取 B2=200 → 300（不是 500）。
/// 这条同时证明求和区的下边界 B3 确实没参与。
#[test]
fn sumif_offset_origin_is_the_criteria_top_left() {
    assert_eq!(num("=SUMIF(Sheet2!A2:A3,\">1\",Sheet2!B1:B3)"), 300.0);
    assert_eq!(num("=SUMIF(Sheet2!A2:A3,\">1\",Sheet2!B1)"), 300.0);
    assert_eq!(num("=SUMIF(A2:A3,\">1\",B1:B3)"), 300.0);
    // 横向条件区：命中的是 B1=100（">1"），列偏移 +1 行偏移 +1 → B2=200。
    assert_eq!(num("=SUMIF(Sheet2!A1:B1,\">1\",Sheet2!A2:B2)"), 200.0);
}

/// 稀疏求和区：条件区命中 A2 与 A3，但 `Sheet2!C2` 根本没有格子。空格按 0
/// 参与，答案是 C3=30 —— 不是「跳过一格再顺次取下一格」的 10+30。
#[test]
fn sumif_sparse_sum_range_keeps_positional_alignment() {
    assert_eq!(num("=SUMIF(Sheet2!A1:A3,\">1\",Sheet2!C1:C3)"), 30.0);
}

/// 跨表整轴的三参形式。`Sheet2!A:A` 只有 A1..A3 三个非空格，命中两个 →
/// 与有界写法同值 500。整轴那条路修的是解析器（见
/// `cross_sheet_whole_axis.rs`），这里钉的是它与三参对齐路径的合流。
#[test]
fn sumif_three_arg_whole_axis_cross_sheet() {
    assert_eq!(num("=SUMIF(Sheet2!A:A,\">1\",Sheet2!B:B)"), 500.0);
    assert_eq!(num("=SUMIF(A:A,\">1\",B:B)"), 500.0);
}

/// 动态区域节点。`OFFSET` / `INDIRECT` / `INDEX` 与字面区域走同一条解析入口，
/// 出现在**任一**侧都必须与字面写法同值。修复前它们与 `SheetRange` 一样掉进
/// 回退，同表写法也照样答 5。
#[test]
fn sumif_three_arg_accepts_dynamic_ranges_on_both_sides() {
    // 求和区是动态区域。
    assert_eq!(num("=SUMIF(A1:A3,\">1\",OFFSET(B1,0,0,3,1))"), 500.0);
    assert_eq!(num("=SUMIF(A1:A3,\">1\",INDIRECT(\"B1:B3\"))"), 500.0);
    assert_eq!(num("=SUMIF(A1:A3,\">1\",INDEX(B1:B3,1))"), 500.0);
    // 条件区是动态区域。
    assert_eq!(num("=SUMIF(OFFSET(A1,0,0,3,1),\">1\",B1:B3)"), 500.0);
    // 跨表 + 动态区域。
    assert_eq!(
        num("=SUMIF(Sheet2!A1:A3,\">1\",OFFSET(Sheet2!B1,0,0,3,1))"),
        500.0
    );
    assert_eq!(
        num("=SUMIF(Sheet2!A1:A3,\">1\",INDIRECT(\"Sheet2!B1:B3\"))"),
        500.0
    );
    assert_eq!(
        num("=SUMIF(OFFSET(Sheet2!A1,0,0,3,1),\">1\",Sheet2!B1:B3)"),
        500.0
    );
}

/// 两档错误规则在跨表下不变：**值档**（求和区）命中行的错误格传播，
/// **条件档**（条件区）的错误格只是「不满足条件的格子」，不短路。
#[test]
fn sumif_cross_sheet_keeps_the_two_error_tiers() {
    let div0 = Value::Error(ValueError::DivisionByZero);
    // 值档：`">1"` 命中 A2、A3，A2 那行的 E2 是 #DIV/0! → 传播。
    assert_eq!(eval("=SUMIF(Sheet2!A1:A3,\">1\",Sheet2!E1:E3)"), div0);
    // 反方向的一行：`"<3"` 命中 A1、A2，命中集合不同但同样撞上 E2。
    assert_eq!(eval("=SUMIF(Sheet2!A1:A3,\"<3\",Sheet2!E1:E3)"), div0);
    // 条件档：F1 是 #DIV/0!，不满足 `">1"` 而已 → F2、F3 命中 → B2+B3。
    assert_eq!(num("=SUMIF(Sheet2!F1:F3,\">1\",Sheet2!B1:B3)"), 500.0);
}

/// 求和区指向不存在的表 → `#REF!`，与 `=SUM(NoSuch!A1:A3)` 同码。
///
/// 条件区与求和区都必须传播 `#REF!`。条件聚合家族不能再把「表不存在」与
/// 「空的匹配集合」混为一谈。
#[test]
fn sumif_missing_sheet_codes() {
    assert_eq!(
        eval("=SUMIF(Sheet2!A1:A3,\">1\",NoSuch!B1:B3)"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(
        eval("=SUMIF(NoSuch!A1:A3,\">1\",Sheet2!B1:B3)"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(
        eval("=COUNTIF(NoSuch!A1:A3,\">1\")"),
        Value::Error(ValueError::InvalidRef)
    );
}

/// 非引用实参仍走二参口径（加条件区自己的值）。这是回退臂**唯一**该管的
/// 情形，钉住它免得下次又被当成「顺手兜底一切」。
#[test]
fn sumif_non_reference_argument_falls_back_to_two_arg() {
    assert_eq!(num("=SUMIF(Sheet2!A1:A3,\">1\",{1,2,3})"), 5.0);
    assert_eq!(num("=SUMIF({1,2,3},\">1\",Sheet2!B1:B3)"), 5.0);
    // 二参本身不受影响。
    assert_eq!(num("=SUMIF(Sheet2!A1:A3,\">1\")"), 5.0);
}

/// `OFFSET` 的锚点：同表 `A1` 与跨表 `Sheet2!A1` 必须同口径。跨表那支此前
/// 直接 `#REF!`；套进聚合更糟 —— `COUNTIF` 把那个 `#REF!` 当成一个不满足
/// 条件的格子，静默答 0。
#[test]
fn offset_accepts_a_cross_sheet_anchor() {
    // 标量位置：取计算出的区域左上角的值。
    assert_eq!(num("=OFFSET(A1,0,1)"), 100.0);
    assert_eq!(num("=OFFSET(Sheet2!A1,0,1)"), 100.0);
    // 区域位置：整块参与聚合。
    assert_eq!(num("=SUM(OFFSET(A1,0,1,3,1))"), 600.0);
    assert_eq!(num("=SUM(OFFSET(Sheet2!A1,0,1,3,1))"), 600.0);
    // 静默答 0 的那条。
    assert_eq!(num("=COUNTIF(OFFSET(Sheet2!A1,0,0,3,1),\">1\")"), 2.0);
    assert_eq!(num("=COUNTIF(OFFSET(A1,0,0,3,1),\">1\")"), 2.0);
    // 区域锚点两侧都不认，是另一条既有口径，不在本次范围 —— 钉住免得漂。
    assert_eq!(
        eval("=OFFSET(Sheet2!A1:B2,0,1)"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(
        eval("=OFFSET(A1:B2,0,1)"),
        Value::Error(ValueError::InvalidRef)
    );
}

/// 家族里**修复前就正确**的那一半（它们早就走 `resolve_range_arg`）。
/// 放在这里当反向护栏：这次的单点改动不能把它们带歪。
#[test]
fn already_correct_family_members_stay_correct() {
    assert_eq!(num("=AVERAGEIF(Sheet2!A1:A3,\">1\",Sheet2!B1:B3)"), 250.0);
    assert_eq!(num("=AVERAGEIF(Sheet2!A1:A3,\">1\",Sheet3!B1:B3)"), 8.5);
    assert_eq!(num("=SUMIFS(Sheet2!B1:B3,Sheet2!A1:A3,\">1\")"), 500.0);
    assert_eq!(num("=SUMIFS(Sheet3!B1:B3,Sheet2!A1:A3,\">1\")"), 17.0);
    assert_eq!(num("=AVERAGEIFS(Sheet2!B1:B3,Sheet2!A1:A3,\">1\")"), 250.0);
    assert_eq!(num("=MAXIFS(Sheet2!B1:B3,Sheet2!A1:A3,\">1\")"), 300.0);
    assert_eq!(num("=MINIFS(Sheet2!B1:B3,Sheet2!A1:A3,\">1\")"), 200.0);
    assert_eq!(num("=COUNTIFS(Sheet2!A1:A3,\">1\",Sheet2!B1:B3,\">150\")"), 2.0);
    assert_eq!(num("=SUBTOTAL(9,Sheet2!B1:B3)"), 600.0);
    assert_eq!(num("=AGGREGATE(9,0,Sheet2!B1:B3)"), 600.0);
    assert_eq!(num("=VLOOKUP(2,Sheet2!A1:B3,2,FALSE)"), 200.0);
    assert_eq!(num("=INDEX(Sheet2!A1:B3,3,2)"), 300.0);
    assert_eq!(num("=SUMPRODUCT(A1:A3,Sheet2!B1:B3)"), 1400.0);
}
