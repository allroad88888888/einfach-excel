//! 带引号表名 —— **写侧**：把语法树渲染回公式文本时重新加引号。
//!
//! 这一半不是锦上添花。`render_formula` 的输出会被写回公式源表：结构性编辑
//! （插删行列）会重渲染**所有**受影响的公式，`FORMULATEXT` 也读它。渲染侧
//! 漏了引号，用户的 `'My Sheet'!A1` 会在一次插行之后被悄悄写成
//! `My Sheet!A1` —— 读不回来，公式从此是 `#VALUE!`。
//!
//! 读侧（解析与求值）在 `quoted_sheet_name.rs`。

mod quoted_sheet_support;

use einfach_core::Value;
use einfach_excel_core::{parse_formula, render_formula};
use quoted_sheet_support::{fixture, ROUND_TRIP_NAMES};

/// 表名需要引号时必须**重新加引号**，名字里的 `'` 必须加倍。
#[test]
fn render_requotes_sheet_names() {
    let cases = [
        ("='My Sheet'!A1", "='My Sheet'!A1"),
        ("='My Sheet'!A1:B2", "='My Sheet'!A1:B2"),
        ("='My Sheet'!A:A", "='My Sheet'!A:A"),
        ("='My Sheet'!$1:$3", "='My Sheet'!$1:$3"),
        ("='My Sheet'!$A$1", "='My Sheet'!$A$1"),
        ("='My Sheet'!A1#", "='My Sheet'!A1#"),
        ("='It''s'!A1", "='It''s'!A1"),
        ("='销售 数据'!A1", "='销售 数据'!A1"),
        ("=SUM('My Sheet'!A1:A3)", "=SUM('My Sheet'!A1:A3)"),
        // 两端各自限定的写法（Excel 也这么写）。走 `DynamicRange`，两侧各渲染
        // 一次表名 —— 引号规则必须在**两个**位置都生效。
        ("='My Sheet'!A1:'My Sheet'!B2", "='My Sheet'!A1:'My Sheet'!B2"),
        // 不带引号的表名不会被顺手加上引号。
        ("=Sheet2!A1", "=Sheet2!A1"),
        // 不必要的引号在 AST 上不留痕（`'Sheet2'!A1` 与 `Sheet2!A1` 是同一棵
        // 树，与 TS 的 `crossSheet.sheetName` 同口径），渲染时按需重加 ——
        // 于是往返一次之后被抹掉。这是**刻意**的：引号是写法而非语义，
        // 保留它就得在 AST 上多存一个纯装饰位。
        ("='Sheet2'!A1", "=Sheet2!A1"),
    ];
    for (src, want) in cases {
        let expr = parse_formula(src).unwrap_or_else(|| panic!("parse failed: {src}"));
        assert_eq!(render_formula(&expr), want, "render mismatch for {src}");
    }
}

/// 往返：`parse → render → parse` 必得同一棵树，且渲染文本本身仍可解析、
/// 再渲染逐字相同。表名清单见 `quoted_sheet_support::ROUND_TRIP_NAMES`。
#[test]
fn parse_render_parse_is_stable() {
    for name in ROUND_TRIP_NAMES {
        // 用带引号写法喂进去（对任何名字都合法），再看往返是否闭合。
        let escaped = name.replace('\'', "''");
        for tail in ["A1", "A1:B2", "A:A", "1:3", "$A$1", "A1#"] {
            let src = format!("='{escaped}'!{tail}");
            let first = parse_formula(&src).unwrap_or_else(|| panic!("parse failed: {src}"));
            let rendered = render_formula(&first);
            let second = parse_formula(&rendered)
                .unwrap_or_else(|| panic!("re-parse failed: {src} -> {rendered}"));
            assert_eq!(first, second, "AST drifted: {src} -> {rendered}");
            assert_eq!(render_formula(&second), rendered, "render not idempotent");
        }
    }
}

/// `FORMULATEXT` 读回来的文本仍带引号。
#[test]
fn formulatext_keeps_the_quotes() {
    for src in [
        "=SUM('My Sheet'!A1:A3)",
        "=SUM('My Sheet'!A:A)",
        "=SUM('It''s'!A1:A3)",
        "=SUM('销售 数据'!A1:A3)",
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

/// **这条是写侧修复的真正理由**：本表插行会重渲染受影响的公式并写回源表。
///
/// 跨表引用本身不随本表结构编辑平移（`shift::retarget` 的既有语义），所以
/// 期望值是「值不变、跨表那一段文本逐字不变」—— 但它必须**经过一次重渲染**
/// 才成立。同表的 `A1` 一起放进公式，保证这条确实落在重写面里（它会变
/// `A2`，证明重渲染真的发生了）。
#[test]
fn structural_edit_does_not_break_quoted_refs() {
    for src in [
        "=SUM('My Sheet'!A1:A3)",
        "=SUM('My Sheet'!A:A)",
        "=SUM('It''s'!A1:A3)",
        "='销售 数据'!$A$1",
    ] {
        let mut wb = fixture();
        wb.set_formula(0, "E5", &format!("{}+A1*0", src));
        let before = wb.get_cell("Sheet1", "E5");
        assert!(!matches!(before, Value::Error(_)), "setup failed: {src}");

        wb.insert_rows(0, 0, 1);
        // 公式被平移到 E6，同表的 `A1` 变 `A2`，跨表部分逐字不动。
        assert_eq!(wb.get_cell("Sheet1", "E6"), before, "value drifted: {src}");
        wb.set_formula(0, "G1", "=FORMULATEXT(E6)");
        // 顶层 `+` 被渲染器无条件加括号（既有行为，见 `render.rs` 的 `BinOp`
        // 臂），所以期望文本是 `=(<原式>+(A2*0))`；重点在 `<原式>` 逐字不变。
        let body = src.trim_start_matches('=');
        assert_eq!(
            wb.get_cell("Sheet1", "G1"),
            Value::Text(format!("=({}+(A2*0))", body)),
            "quoted sheet name lost its quotes after insert_rows: {src}"
        );
    }
}
