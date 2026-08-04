//! 引号规则的单元用例：读的一半、写的一半、以及两半必须闭合的往返。

use super::super::{parse_formula, Expr};
use super::{is_bare_sheet_name, push_sheet_name};

fn quoted(name: &str) -> String {
    let mut out = String::new();
    push_sheet_name(&mut out, name);
    out
}

/// 解析出来的表名。非跨表引用返回 `None`。
fn sheet_of(formula: &str) -> Option<String> {
    match parse_formula(formula)? {
        Expr::SheetRef { sheet, .. } | Expr::SheetRange { sheet, .. } => Some(sheet),
        _ => None,
    }
}

// ---------- 读 ----------

#[test]
fn quotes_are_stripped_from_the_parsed_name() {
    assert_eq!(sheet_of("='My Sheet'!A1").as_deref(), Some("My Sheet"));
}

/// `''` 是转义的单引号，与 TS 侧 `readQuotedSheetName` 逐字同口径。
#[test]
fn doubled_quote_unescapes_to_one() {
    assert_eq!(sheet_of("='It''s'!A1").as_deref(), Some("It's"));
    assert_eq!(sheet_of("='O''Brien'!A1").as_deref(), Some("O'Brien"));
    // 名字整个就是一个引号。
    assert_eq!(sheet_of("=''''!A1").as_deref(), Some("'"));
}

/// 引号内不做第二层解释：`!` 也只是普通字符。分隔符是**闭合引号之后**的那
/// 个 `!`，所以带 `!` 的表名不产生歧义。
#[test]
fn bang_inside_quotes_belongs_to_the_name() {
    assert_eq!(sheet_of("='A!B'!A1").as_deref(), Some("A!B"));
}

/// 不必要的引号在 AST 上**不留痕**：`'Sheet1'!A1` 与 `Sheet1!A1` 是同一棵树。
/// 这条决定了往返之后引号还在不在 —— 见 `round_trip_drops_needless_quotes`。
#[test]
fn needless_quotes_yield_the_same_ast_as_bare() {
    assert_eq!(parse_formula("='Sheet1'!A1"), parse_formula("=Sheet1!A1"));
    assert_eq!(
        parse_formula("='Sheet1'!A1:B2"),
        parse_formula("=Sheet1!A1:B2")
    );
}

/// 引号没闭合 → 整条公式解析失败（TS 侧走 `tokenizer-error`，同样是整条失败）。
#[test]
fn unterminated_quote_fails_the_whole_formula() {
    assert!(parse_formula("='My Sheet!A1").is_none());
    assert!(parse_formula("='My Sheet'!A1 + 'x").is_none());
}

/// 闭合引号后面不是 `!` → 退回普通名字，不是解析失败。照搬 TS 的兜底。
#[test]
fn quoted_name_without_bang_becomes_a_name() {
    assert_eq!(
        parse_formula("='My Sheet'"),
        Some(Expr::Name("My Sheet".to_string()))
    );
}

// ---------- 写 ----------

#[test]
fn bare_names_render_without_quotes() {
    assert_eq!(quoted("Sheet1"), "Sheet1");
    assert_eq!(quoted("A1"), "A1");
    assert_eq!(quoted("SUM"), "SUM");
    assert_eq!(quoted("my_sheet_1"), "my_sheet_1");
}

#[test]
fn names_needing_quotes_get_them() {
    assert_eq!(quoted("My Sheet"), "'My Sheet'");
    // 以数字开头 / 下划线开头 —— 解析器的首字符分流只认 ASCII 字母。
    assert_eq!(quoted("2024Q1"), "'2024Q1'");
    assert_eq!(quoted("_data"), "'_data'");
    // 非 ASCII 一律引起来。
    assert_eq!(quoted("销售 数据"), "'销售 数据'");
    assert_eq!(quoted("销售数据"), "'销售数据'");
    // `.` 走引号（见 `is_bare_sheet_name` 判据 2）。
    assert_eq!(quoted("Sheet.1"), "'Sheet.1'");
    // 空名字。
    assert_eq!(quoted(""), "''");
}

/// 名字里的 `'` 写出来必须加倍，否则读回时会提前闭合。
#[test]
fn apostrophes_are_doubled_on_write() {
    assert_eq!(quoted("It's"), "'It''s'");
    assert_eq!(quoted("'"), "''''");
}

/// `TRUE` / `FALSE` 裸写会被布尔字面量分支先吃掉，所以渲染侧必须加引号。
#[test]
fn boolean_shaped_names_are_quoted() {
    assert_eq!(quoted("TRUE"), "'TRUE'");
    assert_eq!(quoted("false"), "'false'");
    assert!(!is_bare_sheet_name("True"));
    // 但 `TRUEX` / `TRUE1` 不是布尔字面量，可以裸写。
    assert_eq!(quoted("TRUEX"), "TRUEX");
}

// ---------- 两半闭合 ----------

/// 渲染出来的表名文本，重新解析必得原名。这是 `push_sheet_name` 与
/// `scan_quoted_name` 之间唯一的闭合断言 —— 任一侧单独漂移都在这里断。
#[test]
fn every_rendered_name_parses_back_to_itself() {
    for name in [
        "Sheet1",
        "My Sheet",
        "It's",
        "'",
        "''",
        "2024Q1",
        "_data",
        "销售 数据",
        "Sheet.1",
        "TRUE",
        "A!B",
        "a:b",
        "",
        "  ",
        "Ω≈ç",
    ] {
        let formula = format!("={}!A1", quoted(name));
        assert_eq!(
            sheet_of(&formula).as_deref(),
            Some(name),
            "round-trip failed for {:?} (rendered as {})",
            name,
            formula
        );
    }
}
