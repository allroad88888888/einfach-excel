//! LAMBDA 形参的**省略**与 `ISOMITTED` —— 与 `tests/omitted_args.rs` 的
//! 空占位是**两个不同的概念**，所以分成两份规格：
//!
//! - 空占位 `,,`（那边）：调用方**提供了**一个槽位，里面是空值。
//! - 形参省略（这边）：调用方**根本没给**这个位置的实参。
//!
//! `=LAMBDA(x,y,ISOMITTED(y))(5,)` 与 `(5)` 的答案不同，正是这条分界线。
//!
//! 修之前 Rust 侧两件事一起缺：`apply_lambda` 的 arity 是严格相等，少传实参
//! 的调用根本进不了函数体（`#VALUE!`）；`ISOMITTED` 因此永远只会答 FALSE ——
//! 一个「永远不报错也永远不为真」的空壳。
//!
//! ⚠️ **与 Excel 的一条已知分歧，两个引擎一致**：Excel 里只有写成 `[y]` 的
//! 形参才可省略，`=LAMBDA(x,y,x+y)(5)` 在 Excel 里是 `#VALUE!`。两个引擎都
//! 还没有 `[y]` 语法，都把**所有**形参当可选（与 TS 引擎
//! `eval/lambda-apply.ts::buildLambdaContext` 同一条：那边也只挡「实参多于
//! 形参」）。真去补 `[y]` 时两侧必须一起补，否则 `ISOMITTED` 又会分叉。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

/// F1:F5 = 1..5、G1:G5 = 10..50。与 `tests/omitted_args.rs` 同一份夹具。
fn fixture() -> Workbook {
    let mut wb = Workbook::new();
    {
        let s = wb.sheet_mut(0).unwrap();
        for r in 1..=5u32 {
            s.set_cell(&format!("F{r}"), Value::Number(r as f64));
            s.set_cell(&format!("G{r}"), Value::Number((r * 10) as f64));
        }
    }
    wb
}

fn eval(formula: &str) -> Value {
    let mut wb = fixture();
    wb.set_formula(0, "Z1", formula);
    wb.get_cell("Sheet1", "Z1")
}

fn num(n: f64) -> Value {
    Value::Number(n)
}


/// 调用方**少传**实参 ⇒ 形参没拿到东西 ⇒ `ISOMITTED` 答 TRUE。
/// 修之前 `apply_lambda` 的 arity 是严格相等，这条公式根本进不了函数体
/// （`#VALUE!`），`ISOMITTED` 也就永远只会答 FALSE。
#[test]
fn isomitted_is_true_for_a_parameter_that_got_no_argument() {
    assert_eq!(
        eval("=LAMBDA(x,y,IF(ISOMITTED(y),100,200))(5)"),
        num(100.0)
    );
    // 少传的形参在体内就是空值。
    assert_eq!(eval("=LAMBDA(x,y,SUM(x,y))(5)"), num(5.0));
    // 一个都不少传 ⇒ FALSE。
    assert_eq!(
        eval("=LAMBDA(x,y,IF(ISOMITTED(y),100,200))(5,7)"),
        num(200.0)
    );
}

/// **空占位不是省略**：`(5,)` 传了一个空值进去，形参拿到了东西，
/// 所以 `ISOMITTED` 答 FALSE。这条正是两个概念的分界线。
#[test]
fn an_omitted_placeholder_argument_is_not_an_omitted_parameter() {
    assert_eq!(
        eval("=LAMBDA(x,y,IF(ISOMITTED(y),100,200))(5,)"),
        num(200.0)
    );
}

/// 实参**多于**形参仍然是错误。
#[test]
fn too_many_arguments_is_still_an_error() {
    assert_eq!(
        eval("=LAMBDA(x,x*2)(1,2)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

/// LAMBDA 之外（裸公式、LET 体内）`ISOMITTED` 没有意义 ⇒ `#NAME?`。
/// 修之前这里恒答 FALSE —— 一个「永远不报错也永远不为真」的空壳。
#[test]
fn isomitted_outside_a_lambda_is_a_name_error() {
    assert_eq!(eval("=ISOMITTED(123)"), Value::Error(ValueError::InvalidName));
    assert_eq!(
        eval("=LET(a,1,ISOMITTED(a))"),
        Value::Error(ValueError::InvalidName)
    );
}

/// 内层重新绑定同名参数要盖掉外层的省略标记 —— 否则一个嵌套 LAMBDA
/// 会把外层「没传」的结论带进来。
#[test]
fn an_inner_binding_shadows_the_outer_omitted_mark() {
    assert_eq!(
        eval("=LAMBDA(y,LAMBDA(y,IF(ISOMITTED(y),100,200))(7))()"),
        num(200.0)
    );
}
