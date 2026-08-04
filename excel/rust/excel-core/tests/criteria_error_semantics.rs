//! IFS 家族的 criteria 与错误值的两条**方向相反**的语义。
//!
//! 这两条极易改串，所以分开钉：
//!
//! * **A —— 条件是「写着错误码的字符串」**：`"#N/A"` / `"<>#N/A"` 里的 `#N/A`
//!   只是文本。错误格按显示文本参与比较，于是 `"#N/A"` 数得到错误格、
//!   `"<>#N/A"` 数得到「除该错误外的一切」。Excel 的标准错误过滤配方
//!   （Exceljet「Count cells that do not contain errors」）正是靠这个成立：
//!   10 格里 1 个 `#N/A` + 1 个 `#VALUE!` 时
//!   `COUNTIF(rng,"<>#N/A")` = 9、
//!   `COUNTIFS(rng,"<>#N/A",rng,"<>#VALUE!")` = 8。
//!
//! * **B —— criteria 实参**本身**求值成错误值**：`=COUNTIF(rng,#REF!)`、或
//!   criteria 指向一个内容为 `#DIV/0!` 的格子。这一档是普通的实参错误，按
//!   Excel/OpenFormula 的通用规则原样传播，不做任何文本比较。
//!
//! 一句话区分：A 看的是**字符串内容**，B 看的是**值的种类**。
//!
//! 另有一条 A 的连带回归：`<>` 在「非数字、非通配符」的比较上曾被吞掉，退化成
//! `=`（`COUNTIF(rng,"<>apple")` 回的是「等于 apple」的个数）。`"<>#N/A"` 正踩
//! 这条路，所以一并钉住。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

/// A 列 = 条件区，10 格里塞 1 个 `#N/A` + 1 个 `#VALUE!`（Exceljet 那条配方的形状）。
/// B 列 = 值区，1..10，全是干净数字 —— 让值档的错误传播不干扰条件档的断言。
fn env() -> Workbook {
    let mut wb = Workbook::new();
    let crit = [
        Value::Number(10.0),
        Value::Number(20.0),
        Value::Error(ValueError::NotAvailable),
        Value::Number(30.0),
        Value::Number(40.0),
        Value::Error(ValueError::InvalidValue),
        Value::Number(50.0),
        Value::Number(60.0),
        Value::Number(70.0),
        Value::Number(80.0),
    ];
    for (i, v) in crit.into_iter().enumerate() {
        let row = i + 5;
        wb.set_cell(0, &format!("A{}", row), v);
        wb.set_cell(0, &format!("B{}", row), Value::Number(i as f64 + 1.0));
    }
    wb
}

fn eval(wb: &mut Workbook, formula: &str) -> Value {
    wb.set_formula(0, "H1", formula);
    wb.get_cell("Sheet1", "H1")
}

fn num(wb: &mut Workbook, formula: &str) -> f64 {
    match eval(wb, formula) {
        Value::Number(n) => n,
        other => panic!("{formula} → {other:?}, 期望一个数字"),
    }
}

// ===========================================================================
// A —— 条件字符串里写错误码
// ===========================================================================

/// Exceljet 那条配方本身，两个数字都钉死。
#[test]
fn a_exceljet_error_filter_recipe() {
    let mut wb = env();
    assert_eq!(
        num(&mut wb, "=COUNTIF(A5:A14,\"<>#N/A\")"),
        9.0,
        "10 格里只有 1 个 #N/A，其余 9 格（含那个 #VALUE!）都该被数到"
    );
    assert_eq!(
        num(&mut wb, "=COUNTIFS(A5:A14,\"<>#N/A\",A5:A14,\"<>#VALUE!\")"),
        8.0,
        "再排掉 #VALUE! 就剩 8 格 —— 这就是「数非错误格」的标准写法"
    );
}

/// 正向：`"#N/A"` 当条件时数得到错误格。
#[test]
fn a_error_code_string_matches_error_cells() {
    let mut wb = env();
    assert_eq!(num(&mut wb, "=COUNTIF(A5:A14,\"#N/A\")"), 1.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A5:A14,\"#VALUE!\")"), 1.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A5:A14,\"#DIV/0!\")"), 0.0);
    // 值区跟着走：命中的是第 3 行 / 第 6 行，取到 B 列的 3 / 6。
    assert_eq!(num(&mut wb, "=SUMIF(A5:A14,\"#N/A\",B5:B14)"), 3.0);
    assert_eq!(num(&mut wb, "=SUMIF(A5:A14,\"#VALUE!\",B5:B14)"), 6.0);
}

/// 同族一致性：8 个函数在同一条 `"<>#N/A"` 上必须给出同一套行/值口径。
#[test]
fn a_whole_ifs_family_agrees_on_error_code_criteria() {
    let mut wb = env();
    // 9 行命中（排掉第 3 行），B 列 1..10 去掉 3 → 52。
    assert_eq!(num(&mut wb, "=SUMIF(A5:A14,\"<>#N/A\",B5:B14)"), 52.0);
    assert_eq!(num(&mut wb, "=SUMIFS(B5:B14,A5:A14,\"<>#N/A\")"), 52.0);
    assert_eq!(num(&mut wb, "=COUNTIFS(A5:A14,\"<>#N/A\")"), 9.0);
    let avg = 52.0 / 9.0;
    assert!((num(&mut wb, "=AVERAGEIF(A5:A14,\"<>#N/A\",B5:B14)") - avg).abs() < 1e-9);
    assert!((num(&mut wb, "=AVERAGEIFS(B5:B14,A5:A14,\"<>#N/A\")") - avg).abs() < 1e-9);
    assert_eq!(num(&mut wb, "=MAXIFS(B5:B14,A5:A14,\"<>#N/A\")"), 10.0);
    assert_eq!(num(&mut wb, "=MINIFS(B5:B14,A5:A14,\"<>#N/A\")"), 1.0);
}

/// 连带回归：`<>` 对普通文本也得是「不等于」，不能退化成「等于」。
#[test]
fn a_not_equal_on_plain_text_is_a_real_negation() {
    let mut wb = Workbook::new();
    for (i, s) in ["apple", "banana", "apple", "cherry"].into_iter().enumerate() {
        wb.set_cell(0, &format!("A{}", i + 1), Value::Text(s.into()));
    }
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A4,\"apple\")"), 2.0);
    assert_eq!(
        num(&mut wb, "=COUNTIF(A1:A4,\"<>apple\")"),
        2.0,
        "banana + cherry；曾经这里回的是「等于 apple」的个数"
    );
    // `"<>"` = 「非空」。
    let mut wb2 = Workbook::new();
    wb2.set_cell(0, "A1", Value::Text("x".into()));
    wb2.set_cell(0, "A2", Value::Number(1.0));
    assert_eq!(num(&mut wb2, "=COUNTIF(A1:A2,\"<>\")"), 2.0);
}

/// A 的边界：错误格不该被有序比较（`>` / `<`）捞进来 —— 上一轮「条件区错误格
/// 跳过」的结论在这一档仍然成立，改 A 不能把它带翻。
#[test]
fn a_error_cells_still_lose_ordered_comparisons() {
    let mut wb = env();
    assert_eq!(
        num(&mut wb, "=COUNTIF(A5:A14,\">0\")"),
        8.0,
        "8 个数字命中；两个错误格既不 >0 也不 <=0"
    );
    assert_eq!(num(&mut wb, "=COUNTIF(A5:A14,\"<0\")"), 0.0);
}

// ===========================================================================
// B —— criteria 实参本身求值成错误
// ===========================================================================

/// 字面错误常量当 criteria：原样传播，不去数「显示文本等于 #REF! 的格子」。
#[test]
fn b_error_literal_criteria_propagates() {
    let mut wb = env();
    let re = Value::Error(ValueError::InvalidRef);
    assert_eq!(eval(&mut wb, "=COUNTIF(A5:A14,#REF!)"), re);
    assert_eq!(eval(&mut wb, "=SUMIF(A5:A14,#REF!,B5:B14)"), re);
    assert_eq!(eval(&mut wb, "=AVERAGEIF(A5:A14,#REF!,B5:B14)"), re);
    assert_eq!(eval(&mut wb, "=COUNTIFS(A5:A14,#REF!)"), re);
    assert_eq!(eval(&mut wb, "=SUMIFS(B5:B14,A5:A14,#REF!)"), re);
    assert_eq!(eval(&mut wb, "=AVERAGEIFS(B5:B14,A5:A14,#REF!)"), re);
    assert_eq!(eval(&mut wb, "=MAXIFS(B5:B14,A5:A14,#REF!)"), re);
    assert_eq!(eval(&mut wb, "=MINIFS(B5:B14,A5:A14,#REF!)"), re);
}

/// criteria 指向一个算成错误的格子 —— 传播的是**那个**错误码，不是某个通用码。
#[test]
fn b_criteria_cell_error_propagates_its_own_code() {
    let mut wb = env();
    wb.set_formula(0, "D1", "=1/0");
    assert_eq!(
        eval(&mut wb, "=COUNTIF(A5:A14,D1)"),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval(&mut wb, "=COUNTIFS(A5:A14,D1)"),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval(&mut wb, "=SUMIFS(B5:B14,A5:A14,D1)"),
        Value::Error(ValueError::DivisionByZero)
    );
}

/// A 与 B 的分界线，一条测试里正面对照：**同一个** `#N/A`，写成字符串是条件，
/// 求值成错误值是传播。这两个断言一起红过就说明改串了。
#[test]
fn a_and_b_do_not_collide() {
    let mut wb = env();
    // A：字符串 → 数到那 1 个错误格。
    assert_eq!(num(&mut wb, "=COUNTIF(A5:A14,\"#N/A\")"), 1.0);
    // B：同一个错误码，但这次是值 → 传播。
    wb.set_formula(0, "D1", "=NA()");
    assert_eq!(
        eval(&mut wb, "=COUNTIF(A5:A14,D1)"),
        Value::Error(ValueError::NotAvailable)
    );
}

// ===========================================================================
// 分档不变式：只有条件档变，值档照旧传播
// ===========================================================================

/// 值区（sum_range / average_range）里命中行上的错误照旧传播 —— 改 A 只动条件
/// 档，不能顺手把值档的传播也关掉。
#[test]
fn value_tier_errors_still_propagate() {
    let mut wb = env();
    wb.set_cell(0, "B8", Value::Error(ValueError::DivisionByZero));
    let div0 = Value::Error(ValueError::DivisionByZero);
    // `"<>#N/A"` 命中 A8=30 那一行（A7 才是 #N/A），其值区 B8 是错误 → 传播。
    assert_eq!(eval(&mut wb, "=SUMIF(A5:A14,\"<>#N/A\",B5:B14)"), div0);
    assert_eq!(eval(&mut wb, "=SUMIFS(B5:B14,A5:A14,\"<>#N/A\")"), div0);
    assert_eq!(eval(&mut wb, "=AVERAGEIFS(B5:B14,A5:A14,\"<>#N/A\")"), div0);
}
