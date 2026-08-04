//! 一个单元格最终渲染成什么显示文本。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use einfach_core::ValueError;

#[test]
fn formatted_display_uses_number_format() {
    use crate::format::NumberFormat;
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(0.5));
    // General → "0.5".
    assert_eq!(sheet.formatted_display("A1"), "0.5");
    sheet.set_format(
        "A1",
        CellFormat {
            number_format: NumberFormat::Percent { digits: 0 },
            ..Default::default()
        },
    );
    assert_eq!(sheet.formatted_display("A1"), "50%");
}

/// `formatted_display` 的 `Value::Error` 分支必须走 `error_display_token`，
/// 而不是 `ValueError` 的 `Display`。两者在两个 token 上分叉：`WrongType`
/// 与 `WrongArgCount` 的 `Display` 是引擎内部诊断用的 `#TYPE!` / `#ARGS!`
/// （Excel 两个错误码都没有，它们还兼任公式文本序列化，必须能被
/// `parse_error_literal` 读回去），面向用户的渲染只能是 `#VALUE!`。渲染边界
/// 一旦改回 `format!("{e}")`，这两个码就会从每一个 `formatted_display`
/// 调用点漏到 UI 上。完整的非 Excel 码登记表在 `format::error_display_token`。
///
/// wasm 侧的 `wasm_wrong_type_never_reaches_a_cell_display` 盯的是同一条不变
/// 式，但它只能覆盖 `WasmSheet` 那层包装；这条把断言按在 excel-core 自己的
/// 渲染边界上，wasm crate 不参与编译时也照样跑。
#[test]
fn formatted_display_renders_excel_error_vocabulary() {
    let mut sheet = Sheet::new();

    // 直接落一个引擎内部变体：显示必须塌成 Excel 认得的 #VALUE!。
    sheet.set_cell("A1", Value::Error(ValueError::WrongType));
    assert_eq!(format!("{}", ValueError::WrongType), "#TYPE!");
    assert_eq!(
        sheet.formatted_display("A1"),
        "#VALUE!",
        "the engine-internal #TYPE! must never reach a cell display"
    );

    // 参数个数错同理：Excel 是录入期弹框拒绝，压根不会变成单元格错误码。
    sheet.set_cell("A2", Value::Error(ValueError::WrongArgCount));
    assert_eq!(format!("{}", ValueError::WrongArgCount), "#ARGS!");
    assert_eq!(
        sheet.formatted_display("A2"),
        "#VALUE!",
        "the engine-internal #ARGS! must never reach a cell display"
    );

    // 真实求值路径：内建函数的实参类型拒绝走的是同一个分支。
    sheet.set_cell("B1", Value::Text("four".into()));
    assert!(sheet.set_formula("B2", "=SQRT(B1)"));
    assert_eq!(sheet.formatted_display("B2"), "#VALUE!");

    // 实参个数拒绝同样走这个分支。
    assert!(sheet.set_formula("B3", "=LEN()"));
    assert_eq!(sheet.formatted_display("B3"), "#VALUE!");

    // 其余错误码逐字透传，不被上面的塌陷波及。
    assert!(sheet.set_formula("C1", "=1/0"));
    assert_eq!(sheet.formatted_display("C1"), "#DIV/0!");

    // `#CYCLE!` 是本仓刻意保留的扩展词汇（Excel 显示 0 + 状态栏警告），
    // 不在塌陷之列 —— 理由见 `format::error_display_token` 的登记表。
    // 自引用按 B.2 契约返回 false 并把 `#CYCLE!` 写进格子，所以这里不 assert
    // 返回值，只看格子显示成什么。
    assert!(!sheet.set_formula("D1", "=D1+1"));
    assert_eq!(sheet.formatted_display("D1"), "#CYCLE!");

    // 数字格式不得改写错误单元格 —— 错误先于 `format_number` 命中。
    sheet.set_format(
        "A1",
        CellFormat {
            number_format: crate::format::NumberFormat::Percent { digits: 0 },
            ..Default::default()
        },
    );
    assert_eq!(sheet.formatted_display("A1"), "#VALUE!");
}

#[test]
fn effective_format_applies_conditional_rules() {
    use crate::format::{Condition, ConditionalRule, StyleOverrides};
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(150.0));
    sheet.set_conditional_rules(vec![ConditionalRule {
        condition: Condition::GreaterThan(100.0),
        overrides: StyleOverrides {
            color: Some("#ff0000".into()),
            ..Default::default()
        },
    }]);
    let eff = sheet.effective_format("A1");
    assert_eq!(eff.color, Some("#ff0000".into()));
    // Below the threshold → base format passes through.
    sheet.set_cell("A1", Value::Number(50.0));
    let eff = sheet.effective_format("A1");
    assert_eq!(eff.color, None);
}
