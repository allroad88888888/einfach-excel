//! 条件聚合家族**认不认「空格」这个条件** —— 计数那一面（COUNTIF / COUNTIFS）。
//! 值区取数那一面在 `tests/criteria_blank_value_ranges.rs`。
//!
//! 根因与 `tests/sparse_range_blank_cardinality.rs` 同源：
//! `EvalProvider::for_each_range_cell` 的契约是**只发非空格**。COUNTBLANK 那一面
//! 上一批已经修好（矩形格数减出来），判据这一面没修 —— 而 Excel 的判据是认空格的
//! （`""` / `"="` / `"<>x"` / `"<>*"` 命中空格，`>` `<` `>=` `<=` 与具体数值不
//! 命中）。`A1=1 / A2 空 / A3=3` 上 `COUNTIF(A1:A3,"")` 因此答 0，Excel 与本仓
//! TS 参考引擎答 1。
//!
//! 同一次还带出第二条：`matches_criterion` 过去把空格 `coerce_to_number` 成 0，
//! 于是 `SUMIFS(B1:B3,A1:A3,">-1")` 把空格那一行也加了进来。这一条只在**稠密
//! 遍历**的那半个家族（SUMIFS / AVERAGEIF* / MAXIFS / MINIFS）暴露 —— 稀疏遍历的
//! COUNTIF / SUMIF 根本读不到空格，看不出差别。同一个判据在同一个引擎里两种答案。
//!
//! 口径来源：本仓 TS 参考引擎（`eval/sparse-criteria.ts` +
//! `eval/sparse-single-criterion.ts` 的 `matchesBlank` / `implicitCount` /
//! non-blank driver 三件套），逐条实跑对过。整轴基数与 `COUNTBLANK` 同源，那条
//! 有 Excel 16.111.2 for Mac 实测背书。
//!
//! 必须走 Sheet / Workbook 集成路径：`src/eval_tests` 的 `AtomEvalProvider` 是
//! **稠密**的，空格照发不误，抓不住稀疏那一面。

mod criteria_blank_support;

use criteria_blank_support::{hole_in_the_middle, number};
use einfach_core::Value;
use einfach_excel_core::{Sheet, Workbook};

// ───────────────────── 单条件：哪些判据认空格 ─────────────────────

#[test]
fn countif_sees_the_hole_a_sparse_walk_never_emits() {
    let mut s = hole_in_the_middle();
    // 认空格的四种写法。
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"\")"), 1.0);
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"=\")"), 1.0);
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"<>1\")"), 2.0);
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"<>x\")"), 3.0);
    // 通配符档：空格不是文本格，于是 `"*"` 不命中、`"<>*"` 命中 —— 两者仍是
    // 整个区域上的严格补集（0 + 3 = 3）。
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"*\")"), 0.0);
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"<>*\")"), 3.0);
    // `"<>"` 是**不等于空**，照旧只数非空格。
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"<>\")"), 2.0);
    // 1×1 的空区域也是一格。
    assert_eq!(number(&mut s, "=COUNTIF(C7,\"\")"), 1.0);
    // 数组字面量形态没有「洞」，`""` 那个元素本来就发得出来。
    assert_eq!(number(&mut s, "=COUNTIF({1,\"\",3},\"\")"), 1.0);
}

/// 空格**不参与数值比较**：它在判据眼里不是 0，是「没有可比的数值」。
/// 这条是 `matches_criterion` 里那个 `coerce_to_number(Null) = 0` 的围栏 ——
/// 同一个判据在稀疏侧（COUNTIF）与稠密侧（COUNTIFS）必须同答案。
#[test]
fn blank_never_matches_numeric_criteria() {
    let mut s = hole_in_the_middle();
    // 区间判据：A1=1 / A3=3 都落在里面，空格不落 → 2 而不是 3。
    // 等值判据 `0`：一格都不该有 —— 空格不是 0。
    for (crit, expected) in [
        ("\">-1\"", 2.0),
        ("\"<5\"", 2.0),
        ("\">=0\"", 2.0),
        ("\"<=5\"", 2.0),
        ("0", 0.0),
        ("\"=0\"", 0.0),
    ] {
        let countif = number(&mut s, &format!("=COUNTIF(A1:A3,{crit})"));
        let countifs = number(&mut s, &format!("=COUNTIFS(A1:A3,{crit})"));
        assert_eq!(countif, expected, "COUNTIF 在 {crit} 上把空格数了进来");
        assert_eq!(countif, countifs, "COUNTIF / COUNTIFS 在 {crit} 上分叉了");
    }
}

// ───────────────────── 整轴：基数与 COUNTBLANK 同源 ─────────────────────

/// 整列引用下「空格命中数」= 网格大小 − 非空格数，与 `COUNTBLANK` 同一个矩形
/// 基数、同一套「算不算空」。两者必须**逐字相等**，不是各自算各自的。
#[test]
fn whole_axis_blank_criteria_shares_countblank_cardinality() {
    let mut s = hole_in_the_middle();
    let blanks = number(&mut s, "=COUNTBLANK(A:A)");
    assert_eq!(blanks, 1_048_576.0 - 2.0);
    assert_eq!(number(&mut s, "=COUNTIF(A:A,\"\")"), blanks);
    assert_eq!(number(&mut s, "=COUNTIFS(A:A,\"\")"), blanks);
    // `"<>1"` 认空格 → 整列减掉「等于 1」的那一格。
    assert_eq!(number(&mut s, "=COUNTIF(A:A,\"<>1\")"), 1_048_576.0 - 1.0);
    assert_eq!(number(&mut s, "=COUNTIFS(A:A,\"<>1\")"), 1_048_576.0 - 1.0);
    // 不认空格的判据不受影响，整列仍是稀疏流。
    assert_eq!(number(&mut s, "=COUNTIF(A:A,\"<>\")"), 2.0);
    assert_eq!(number(&mut s, "=COUNTIFS(A:A,\">0\")"), 2.0);
}

/// **不物化的围栏**：整个网格 1048576 × 16384 ≈ 1.7e10 格。三个函数都必须是
/// 「矩形格数减非空格数」的闭式；「遍历矩形」的实现即便每格 1 ns 也要 17 秒。
/// 所以这条绿着本身就是证明，不必断言耗时。
#[test]
fn whole_grid_blank_criteria_is_closed_form() {
    // 每条一张新表：Z9 落在 `A:XFD` 里，同一张表上装第二条会撞自引用。
    let total = 1_048_576.0 * 16_384.0;
    for formula in [
        "=COUNTBLANK(A:XFD)",
        "=COUNTIF(A:XFD,\"\")",
        "=COUNTIFS(A:XFD,\"\")",
    ] {
        let mut s = Sheet::new();
        s.set_cell("A1", Value::Number(1.0));
        s.set_cell("A3", Value::Number(3.0));
        // 非空格：A1 / A3 / 探针自己 Z9。
        assert_eq!(number(&mut s, formula), total - 3.0, "{formula}");
    }
}

/// 多条件、判据全认空格 —— 走的是「各条件区非空位置取并集，矩形减并集」那条。
/// 并集大小的上界是相关区域的非空格数，与矩形无关，所以整轴照样闭式。
#[test]
fn whole_axis_multi_criteria_stays_closed_form() {
    let mut s = hole_in_the_middle();
    // A 列空 + B 列不等于 x：只有第 2 行两边都满足。其余 1048573 行两列全空，
    // 一律全中。
    assert_eq!(
        number(&mut s, "=COUNTIFS(A:A,\"\",B:B,\"<>x\")"),
        1_048_576.0 - 3.0 + 1.0
    );
}

// ───────────────────── 多条件计数 ─────────────────────

/// `COUNTIFS` 这里曾经挂着一条 `has_value` 守卫（「一行里所有条件区都是空格就不
/// 算命中」），把认空格的判据整类判死。守卫去掉后整轴基数才是正确答案。
#[test]
fn countifs_counts_blank_rows() {
    let mut s = hole_in_the_middle();
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\"\")"), 1.0);
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\"=\")"), 1.0);
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\"<>1\")"), 2.0);
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\"<>\")"), 2.0);
    // 两条判据：空格行在 A 上认、在 B 上是 20 > 0，两边都过。
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\"<>1\",B1:B3,\">0\")"), 2.0);
    // B 列没有空格，所以 `""` 在第二条上把三行全否掉。
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\"\",B1:B3,\"\")"), 0.0);
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\"<>x\",B1:B3,\"<>y\")"), 3.0);
}

/// 算出空文本 `""` 的公式格：它**发得出来**，判据照旧按值判 —— 与 `COUNTBLANK`
/// 把它算空是同一个答案，但两条路不同（一条是发出来的格子，一条是没发出来的）。
#[test]
fn empty_text_formula_cell_counts_as_blank_for_criteria() {
    let mut s = Sheet::new();
    s.set_cell("A1", Value::Number(1.0));
    assert!(s.set_formula("A2", "=\"\""));
    s.set_cell("A3", Value::Number(3.0));
    assert_eq!(s.get_cell("A2"), Value::Text(String::new()));
    assert_eq!(number(&mut s, "=COUNTBLANK(A1:A3)"), 1.0);
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"\")"), 1.0);
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\"\")"), 1.0);
    // 但它对 `"<>"`（不等于空）来说仍是「空」—— 与真空格同一档。
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\"<>\")"), 2.0);
}

#[test]
fn cross_sheet_counting_gets_the_same_treatment() {
    let mut wb = Workbook::new();
    let src = wb.add_sheet("Src");
    {
        let sh = wb.sheet_mut(src).unwrap();
        sh.set_cell("A1", Value::Number(1.0));
        sh.set_cell("A3", Value::Number(3.0));
    }
    let dst = wb.add_sheet("Dst");
    for (cell, formula, expected) in [
        ("D1", "=COUNTIF(Src!A1:A3,\"\")", 1.0),
        ("D2", "=COUNTIFS(Src!A1:A3,\"\")", 1.0),
        ("D3", "=COUNTIF(Src!A:A,\"\")", 1_048_576.0 - 2.0),
    ] {
        assert!(wb.sheet_mut(dst).unwrap().set_formula(cell, formula));
        assert_eq!(
            wb.sheet(dst).unwrap().get_cell(cell),
            Value::Number(expected),
            "{formula}"
        );
    }
}

/// 反向围栏：不认空格的判据，计数一个都不许动。
#[test]
fn non_blank_criteria_counts_are_unchanged() {
    let mut s = hole_in_the_middle();
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,\">0\")"), 2.0);
    assert_eq!(number(&mut s, "=COUNTIF(A1:A3,3)"), 1.0);
    assert_eq!(number(&mut s, "=COUNTIFS(A1:A3,\">0\",B1:B3,\">10\")"), 1.0);
}
