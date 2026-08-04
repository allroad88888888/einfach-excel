//! 空格判据下**值区那一侧取得对不对**：SUMIF / AVERAGEIF / SUMIFS /
//! AVERAGEIFS / MAXIFS / MINIFS。计数那一面在
//! `tests/criteria_blank_cardinality.rs`，根因与口径来源写在那边的文件头。
//!
//! 这一面比计数多两个问题：
//!
//! 1. **条件区的空格位置上，值区那一格可能是个实打实的数**。
//!    `SUMIF(A1:A3,"",B1:B3)` 在 A2 空、B2=20 时答 20 —— 稀疏遍历条件区的实现
//!    根本走不到那一行。
//! 2. **空格在值区一侧则什么都不贡献**，也不进 AVERAGE 的分母。别把「空格要算
//!    命中」推广过去。
//!
//! 判据全认空格时，候选改由**值区**稀疏流驱动（值格为空的位置对和 / 平均 /
//! 极值都没有贡献，漏掉不影响答案），所以整轴照样闭式。

mod criteria_blank_support;

use criteria_blank_support::{hole_in_the_middle, number, probe};
use einfach_core::{Value, ValueError};
use einfach_excel_core::{Sheet, Workbook};

// ───────────────────── 空格在条件区，值在值区 ─────────────────────

/// 二参 SUMIF 不受影响（空格加进去也是加 0），三参才要。
#[test]
fn sumif_reaches_targets_whose_criteria_cell_is_blank() {
    let mut s = hole_in_the_middle();
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"\")"), 0.0);
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"\",B1:B3)"), 20.0);
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"=\",B1:B3)"), 20.0);
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"<>1\",B1:B3)"), 50.0);
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"<>*\",B1:B3)"), 60.0);
    // `"<>"` 不认空格，答案不变。
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"<>\",B1:B3)"), 40.0);
    // AVERAGEIF 的分母只数**真正的数字**：唯一命中的是空格行 → B2 进分母。
    assert_eq!(number(&mut s, "=AVERAGEIF(A1:A3,\"\",B1:B3)"), 20.0);
    // 二参 AVERAGEIF 命中的是空格自己，空格不进分母 → 一格都没有 → `#DIV/0!`
    // （微软文档：average_range 里的空格被忽略；没有格子满足条件则 `#DIV/0!`）。
    assert!(matches!(
        probe(&mut s, "=AVERAGEIF(A1:A3,\"\")"),
        Value::Error(ValueError::DivisionByZero)
    ));
}

/// 求和区按 Excel 的「左上角 + 条件区形状」重定尺寸，自己的行列数不参与。
/// 空格判据下这条也得成立 —— 候选是按条件区形状枚举的，不是按求和区自己的。
#[test]
fn sum_range_is_resized_to_the_criteria_shape() {
    let mut s = hole_in_the_middle();
    s.set_cell("C5", Value::Number(100.0));
    s.set_cell("C6", Value::Number(200.0));
    s.set_cell("C7", Value::Number(300.0));
    // 只给左上角，仍按 3 行取 C5:C7。
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"\",C5)"), 200.0);
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"\",C5:C7)"), 200.0);
    // 给多了也只取 3 行。
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"<>1\",C5:C20)"), 500.0);
}

#[test]
fn multi_criteria_value_family_aggregates_blank_rows() {
    let mut s = hole_in_the_middle();
    assert_eq!(number(&mut s, "=SUMIFS(B1:B3,A1:A3,\"\")"), 20.0);
    assert_eq!(number(&mut s, "=SUMIFS(B1:B3,A1:A3,\"<>1\")"), 50.0);
    assert_eq!(number(&mut s, "=AVERAGEIFS(B1:B3,A1:A3,\"\")"), 20.0);
    assert_eq!(number(&mut s, "=AVERAGEIFS(B1:B3,A1:A3,\"<>1\")"), 25.0);
    assert_eq!(number(&mut s, "=MAXIFS(B1:B3,A1:A3,\"\")"), 20.0);
    assert_eq!(number(&mut s, "=MAXIFS(B1:B3,A1:A3,\"<>1\")"), 30.0);
    assert_eq!(number(&mut s, "=MINIFS(B1:B3,A1:A3,\"<>1\")"), 20.0);
}

/// 空格**不参与数值比较**。稠密遍历的这半个家族过去把空格 `coerce_to_number`
/// 成 0，于是 `">-1"` / `"<5"` / `0` 都把空格那一行也算了进来 ——
/// `SUMIFS(B1:B3,A1:A3,">-1")` 多加了 B2=20。
#[test]
fn blank_never_matches_numeric_criteria_on_the_value_side() {
    let mut s = hole_in_the_middle();
    assert_eq!(number(&mut s, "=SUMIFS(B1:B3,A1:A3,\">-1\")"), 40.0);
    assert_eq!(number(&mut s, "=SUMIFS(B1:B3,A1:A3,\"<5\")"), 40.0);
    assert_eq!(number(&mut s, "=SUMIFS(B1:B3,A1:A3,0)"), 0.0);
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\"<5\",B1:B3)"), 40.0);
    assert_eq!(number(&mut s, "=AVERAGEIF(A1:A3,\"<5\",B1:B3)"), 20.0);
    assert_eq!(number(&mut s, "=AVERAGEIFS(B1:B3,A1:A3,\">-1\")"), 20.0);
    assert_eq!(number(&mut s, "=MAXIFS(B1:B3,A1:A3,\"<5\")"), 30.0);
    assert_eq!(number(&mut s, "=MINIFS(B1:B3,A1:A3,\"<5\")"), 10.0);
}

// ───────────────────── 空格在值区一侧 ─────────────────────

/// 反过来的一面：值区的空格对和 / 平均 / 极值都没有贡献，也不进分母。
#[test]
fn blank_on_the_value_side_contributes_nothing() {
    let mut s = Sheet::new();
    for (cell, n) in [("A1", 1.0), ("A2", 2.0), ("A3", 3.0)] {
        s.set_cell(cell, Value::Number(n));
    }
    s.set_cell("B1", Value::Number(10.0));
    // B2 空
    s.set_cell("B3", Value::Number(30.0));
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\">0\",B1:B3)"), 40.0);
    assert_eq!(number(&mut s, "=SUMIFS(B1:B3,A1:A3,\">0\")"), 40.0);
    // 分母是 2 而不是 3。
    assert_eq!(number(&mut s, "=AVERAGEIF(A1:A3,\">0\",B1:B3)"), 20.0);
    assert_eq!(number(&mut s, "=AVERAGEIFS(B1:B3,A1:A3,\">0\")"), 20.0);
    assert_eq!(number(&mut s, "=MAXIFS(B1:B3,A1:A3,\">0\")"), 30.0);
    assert_eq!(number(&mut s, "=MINIFS(B1:B3,A1:A3,\">0\")"), 10.0);
    // 条件区里没有空格；`""` 只有把 B 列当条件区时才命中得到那个洞。
    assert_eq!(number(&mut s, "=COUNTIF(B1:B3,\"\")"), 1.0);
    assert_eq!(number(&mut s, "=SUMIF(B1:B3,\"\",A1:A3)"), 2.0);
}

// ───────────────────── 整轴 / 错误分档 / 跨表 ─────────────────────

/// 判据全认空格时值型函数改由**值区**稀疏流驱动，整轴因此照样闭式：
/// 走的是 B 列那三格，不是一百万行。
#[test]
fn whole_axis_value_family_stays_closed_form() {
    let mut s = hole_in_the_middle();
    assert_eq!(number(&mut s, "=SUMIFS(B:B,A:A,\"\")"), 20.0);
    assert_eq!(number(&mut s, "=MAXIFS(B:B,A:A,\"\")"), 20.0);
    assert_eq!(number(&mut s, "=SUMIF(A:A,\"\",B:B)"), 20.0);
    assert_eq!(number(&mut s, "=AVERAGEIF(A:A,\"\",B:B)"), 20.0);
    // 有一条判据不认空格时改由**那条判据**驱动，同样闭式。
    assert_eq!(number(&mut s, "=SUMIFS(B:B,A:A,\">0\")"), 40.0);
    assert_eq!(number(&mut s, "=SUMIF(A:A,\">0\",B:B)"), 40.0);
}

/// 分档不变：条件区的错误格只是个不满足判据的普通格子；值区的错误格在命中位置
/// 上要传播。空格路径不能把这条冲掉。
#[test]
fn error_tiers_survive_the_blank_path() {
    let mut s = Sheet::new();
    s.set_cell("A1", Value::Number(1.0));
    s.set_cell("A3", Value::Number(3.0));
    s.set_cell("B1", Value::Number(10.0));
    assert!(s.set_formula("B2", "=1/0"));
    s.set_cell("B3", Value::Number(30.0));
    // A2 空 → 命中 → 读到 B2 的 #DIV/0! → 传播。
    assert!(matches!(
        probe(&mut s, "=SUMIF(A1:A3,\"\",B1:B3)"),
        Value::Error(ValueError::DivisionByZero)
    ));
    assert!(matches!(
        probe(&mut s, "=SUMIFS(B1:B3,A1:A3,\"\")"),
        Value::Error(ValueError::DivisionByZero)
    ));
    // 没命中的行读都不读 —— A2 空，`">0"` 不认空格。
    assert_eq!(number(&mut s, "=SUMIFS(B1:B3,A1:A3,\">0\")"), 40.0);
    // 条件区里的错误格照旧只是个格子：`"<>"` 命中它（它是非空格）。
    assert_eq!(number(&mut s, "=SUMIF(B1:B3,\"<>\",A1:A3)"), 4.0);
}

#[test]
fn cross_sheet_value_ranges_get_the_same_treatment() {
    let mut wb = Workbook::new();
    let src = wb.add_sheet("Src");
    {
        let sh = wb.sheet_mut(src).unwrap();
        sh.set_cell("A1", Value::Number(1.0));
        sh.set_cell("A3", Value::Number(3.0));
        sh.set_cell("B1", Value::Number(10.0));
        sh.set_cell("B2", Value::Number(20.0));
        sh.set_cell("B3", Value::Number(30.0));
    }
    let dst = wb.add_sheet("Dst");
    for (cell, formula, expected) in [
        ("D1", "=SUMIF(Src!A1:A3,\"\",Src!B1:B3)", 20.0),
        ("D2", "=SUMIFS(Src!B1:B3,Src!A1:A3,\"\")", 20.0),
        ("D3", "=AVERAGEIF(Src!A1:A3,\"<>1\",Src!B1:B3)", 25.0),
        ("D4", "=MAXIFS(Src!B1:B3,Src!A1:A3,\"\")", 20.0),
    ] {
        assert!(wb.sheet_mut(dst).unwrap().set_formula(cell, formula));
        assert_eq!(
            wb.sheet(dst).unwrap().get_cell(cell),
            Value::Number(expected),
            "{formula}"
        );
    }
}

/// 反向围栏：不认空格的判据，取数一个都不许动。
#[test]
fn non_blank_criteria_values_are_unchanged() {
    let mut s = hole_in_the_middle();
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\">1\")"), 3.0);
    assert_eq!(number(&mut s, "=SUMIF(A1:A3,\">1\",B1:B3)"), 30.0);
    assert_eq!(number(&mut s, "=SUMIFS(B1:B3,A1:A3,\">1\")"), 30.0);
    assert_eq!(number(&mut s, "=AVERAGEIF(A1:A3,\">0\",B1:B3)"), 20.0);
    assert_eq!(number(&mut s, "=AVERAGEIFS(B1:B3,A1:A3,\">0\")"), 20.0);
    assert_eq!(number(&mut s, "=MAXIFS(B1:B3,A1:A3,\">0\")"), 30.0);
    assert_eq!(number(&mut s, "=MINIFS(B1:B3,A1:A3,\">0\")"), 10.0);
}
