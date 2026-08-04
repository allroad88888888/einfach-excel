//! criteria 的**文本比较**这一层：大小写，以及通配符判据「只匹配文本」。
//!
//! 孪生规格：`excel/excel-core-ts/test/criteria-wildcard-case.test.ts`（同一套
//! 夹具、同一批数字）。跨引擎钉子在
//! `excel/solid-excel/test/cross-engine-parity-criteria-wildcard.ts`。
//!
//! 两条规则，Excel 依据分别是：
//!
//! * **不区分大小写** —— MS 官方 COUNTIF 文档原话：“Criteria aren't case
//!   sensitive. In other words, the string "apples" and the string "APPLES"
//!   will match the same cells.” 注意别和 `EXACT()` 混为一谈，那个函数**区分**
//!   大小写，是 criteria 做不到大小写敏感时的标准替代写法。
//! * **通配符判据只匹配文本格** —— Exceljet「Count cells that contain text」
//!   （`=COUNTIF(data,"*")`）原话：“Empty cells and cells that contain numeric
//!   values or errors should not be included in the count.” 同页给出互补的
//!   `=COUNTIF(data,"<>*")`，在同一个 11 格区域上一个回 4、另一个回 7 ——
//!   两者是**严格互补**的，所以数字格 / 错误格 / 空格全部落在 `"<>*"` 那一侧。
//!
//! 本文件此前钉住的缺陷（改前的实测值）：
//!
//! | 探针 | Excel | Rust 改前 |
//! |---|---|---|
//! | `COUNTIF(A1:A8,"APPLE")` | 2 | 1 —— 文本兜底是逐字节 `==` |
//! | `COUNTIF(A1:A8,"*")` | 5 | 8 —— 一切都先 `coerce_to_text` 再匹配 |
//! | `COUNTIF(A1:A8,"<>*")` | 3 | 0 —— 同上的补集 |
//! | `COUNTIF(A1:A8,"*N*")` | 0 | 1 —— 错误格的显示文本被通配符吃到 |
//!
//! 走的是 `set_formula` 的真实公式路径，不是直接调 `matches_criterion`。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

/// A 列 = 条件区，8 格覆盖 criteria 会遇到的全部值种类；**故意不留空格**，
/// 好让「区域枚举跳不跳空格」这条正交分歧不污染本文件的断言。
/// B 列 = 值区，1..8 全是干净数字。
///
/// 行号与含义（下面所有闭式数字都从这张表算出来）：
/// 1 `apple`(文本) 2 `APPLE`(文本) 3 `5`(数字) 4 `TRUE`(布尔)
/// 5 `#N/A`(错误) 6 `a*b`(文本) 7 `~`(文本) 8 `"5"`(文本型数字)
///
/// 于是：**文本格 5 个**（1/2/6/7/8），**非文本格 3 个**（3/4/5）。
fn env() -> Workbook {
    let mut wb = Workbook::new();
    let crit = [
        Value::Text("apple".into()),
        Value::Text("APPLE".into()),
        Value::Number(5.0),
        Value::Boolean(true),
        Value::Error(ValueError::NotAvailable),
        Value::Text("a*b".into()),
        Value::Text("~".into()),
        Value::Text("5".into()),
    ];
    for (i, v) in crit.into_iter().enumerate() {
        wb.set_cell(0, &format!("A{}", i + 1), v);
        wb.set_cell(0, &format!("B{}", i + 1), Value::Number(i as f64 + 1.0));
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

#[test]
fn criteria_text_comparison_ignores_case() {
    let mut wb = env();
    // 三种大小写写法必须给同一个 2 —— `apple` 与 `APPLE` 两格都命中。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"apple\")"), 2.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"APPLE\")"), 2.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"ApPlE\")"), 2.0);
    // `<>` 是同一条路径的补集：8 - 2 = 6。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"<>APPLE\")"), 6.0);
    // 布尔格也走文本兜底（`coerce_to_text(TRUE)` = `"TRUE"`），一并不区分大小写。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"TRUE\")"), 1.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"true\")"), 1.0);
}

#[test]
fn wildcard_criteria_match_text_cells_only() {
    let mut wb = env();
    // `"*"` = 文本格个数。数字 / 布尔 / 错误都不算。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"*\")"), 5.0);
    // `"?*"`（至少一个字符）在这张表上与 `"*"` 同解 —— 没有零长文本格。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"?*\")"), 5.0);
    // 严格互补：非文本格 = 数字 + 布尔 + 错误 = 3。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"<>*\")"), 3.0);
    // `"?"` = 恰好一个字符的**文本**格：`~` 与文本 `"5"`。数字 5 不算。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"?\")"), 2.0);
    // 通配符 × 数字格的分界：`"5*"` 只吃文本 `"5"`，吃不到数字 5……
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"5*\")"), 1.0);
    // ……而**不带**通配符的 `"5"` 照旧两个都吃（数值强转那一档没被带翻）。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"5\")"), 2.0);
    // 通配符 × 错误格：错误格的显示文本**不**参与通配符匹配。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"*N*\")"), 0.0);
    // 通配符 × 布尔格：`TRUE` 是逻辑值不是文本，`"T*"` 吃不到它。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"T*\")"), 0.0);
}

/// 与上一轮修好的「A —— 条件字符串里写错误码」的分界线。
///
/// 同一个错误格：**不带**通配符时按显示文本比（`"#N/A"` 命中它），**带**通配符
/// 时它根本不参与（`"*N*"` 命中不了）。两条写在同一个 test 里 —— 把通配符那条
/// 改成「错误格也 `coerce_to_text` 一下」就会连带把这条一起弄红。
#[test]
fn wildcard_and_error_string_criteria_do_not_collide() {
    let mut wb = env();
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"#N/A\")"), 1.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"*N*\")"), 0.0);
    // `"<>#N/A"` 仍是「除那一格以外的全部」= 7；`"<>*"` 是完全不同的 3。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"<>#N/A\")"), 7.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"<>*\")"), 3.0);
}

/// `~` 转义。`~*` / `~?` 把通配符降级成字面量，`~~` 是字面量 `~` 本身。
#[test]
fn tilde_escapes_wildcards() {
    let mut wb = env();
    // `a*b`：不转义时是「a 开头 b 结尾」的模式，这张表里只有 `a*b` 那格自己合。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"a*b\")"), 1.0);
    // 转义后是字面量三字符串 `a*b`，仍然只有那一格 —— 但走的是完全不同的路。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"a~*b\")"), 1.0);
    // 大小写在通配符路径上同样不敏感。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"A~*B\")"), 1.0);
    // `~~` = 一个字面量 `~`，命中第 7 格（内容就是 `~`），**不是**内容为 `~~` 的格子。
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"~~\")"), 1.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A7:A7,\"~~\")"), 1.0);
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A6,\"~~\")"), 0.0);
}

/// 同族自洽：八个名字在**同一条**判据上必须给同一套命中行。
///
/// 命中行由 A 列决定，闭式值从 B 列（1..8）算：
/// `"*"` → 文本行 1/2/6/7/8 → 和 24、均值 4.8、极值 8 / 1；
/// `"APPLE"` → 行 1/2 → 和 3、均值 1.5、极值 2 / 1。
#[test]
fn the_eight_functions_agree_on_one_criterion() {
    let mut wb = env();
    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"*\")"), 5.0);
    assert_eq!(num(&mut wb, "=COUNTIFS(A1:A8,\"*\")"), 5.0);
    assert_eq!(num(&mut wb, "=SUMIF(A1:A8,\"*\",B1:B8)"), 24.0);
    assert_eq!(num(&mut wb, "=SUMIFS(B1:B8,A1:A8,\"*\")"), 24.0);
    assert!((num(&mut wb, "=AVERAGEIF(A1:A8,\"*\",B1:B8)") - 4.8).abs() < 1e-9);
    assert!((num(&mut wb, "=AVERAGEIFS(B1:B8,A1:A8,\"*\")") - 4.8).abs() < 1e-9);
    assert_eq!(num(&mut wb, "=MAXIFS(B1:B8,A1:A8,\"*\")"), 8.0);
    assert_eq!(num(&mut wb, "=MINIFS(B1:B8,A1:A8,\"*\")"), 1.0);

    assert_eq!(num(&mut wb, "=COUNTIF(A1:A8,\"APPLE\")"), 2.0);
    assert_eq!(num(&mut wb, "=COUNTIFS(A1:A8,\"APPLE\")"), 2.0);
    assert_eq!(num(&mut wb, "=SUMIF(A1:A8,\"APPLE\",B1:B8)"), 3.0);
    assert_eq!(num(&mut wb, "=SUMIFS(B1:B8,A1:A8,\"APPLE\")"), 3.0);
    assert!((num(&mut wb, "=AVERAGEIF(A1:A8,\"APPLE\",B1:B8)") - 1.5).abs() < 1e-9);
    assert!((num(&mut wb, "=AVERAGEIFS(B1:B8,A1:A8,\"APPLE\")") - 1.5).abs() < 1e-9);
    assert_eq!(num(&mut wb, "=MAXIFS(B1:B8,A1:A8,\"APPLE\")"), 2.0);
    assert_eq!(num(&mut wb, "=MINIFS(B1:B8,A1:A8,\"APPLE\")"), 1.0);
}

/// 跨引擎夹具只能用公式播种（`WorkloadCell` 没有 text / boolean 两种 kind），
/// 所以那边的布尔格写成 `=(1=1)`、文本格写成 `="apple"`。这一条证明这两种
/// 写法真的产出布尔 / 文本，免得跨引擎那张表在一个**播种就错了**的夹具上通过。
///
/// 布尔格用 `=(1=1)` 而不是 `=TRUE()`：后者在 **TS 参考引擎**上回
/// `#VALUE! expected LAMBDA`（一条与本次无关的、单独的分歧），拿它当夹具会
/// 让跨引擎那张表红在播种上而不是红在语义上。纯运算符写法两个引擎都认。
#[test]
fn formula_seeded_boolean_and_text_behave_like_literals() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "D1", "=(1=1)");
    wb.set_formula(0, "D2", "=\"apple\"");
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Boolean(true));
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Text("apple".into()));
    // 布尔格不是文本 → 通配符吃不到；文本格吃得到。
    assert_eq!(num(&mut wb, "=COUNTIF(D1:D2,\"*\")"), 1.0);
    assert_eq!(num(&mut wb, "=COUNTIF(D1:D2,\"true\")"), 1.0);
}
