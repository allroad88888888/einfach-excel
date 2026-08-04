//! 浮点溢出的出口：**`#NUM!`，不是 `Infinity`**。
//!
//! # 依据
//!
//! Microsoft Learn，"Floating-point arithmetic may give inaccurate result in
//! Excel"，§"Cases in which we adhere to IEEE 754" / §"Cases in which we don't
//! adhere to IEEE 754"：
//!
//! - **Overflow** — "Overflow occurs when a number is too large to be
//!   represented. Excel uses its own special representation for this case
//!   (`#NUM!`)."
//! - **Underflow** — "Underflow occurs when a number is generated that is too
//!   small to be represented. In IEEE and Excel, the result is 0 (with the
//!   exception that IEEE has a concept of -0, and Excel doesn't)."
//! - **NaN** — "Excel instead immediately generates an error such as `#NUM!`
//!   or `#DIV/0!`."
//! - **Infinities** — "Infinities occur when you divide by 0. Excel doesn't
//!   support infinities, rather, it gives a `#DIV/0!` error in these cases."
//!
//! 配套的 "Excel specifications and limits" 把上界写成
//! "Largest allowed positive number via formula: 1.7976931348623158e+308"
//! —— 也就是 `f64::MAX` **本身允许**，越过才报错。所以闸门的判据是
//! `is_finite()`，不是某个手写的阈值。
//!
//! # 为什么下溢和溢出要分开钉
//!
//! 两者方向相反：溢出必须报错，下溢必须**不**报错（给 `0`）。一条只测溢出的
//! 套件配上一个「非有限或过小都报错」的实现照样全绿，而 `=1E-308/1E10` 会从
//! `0` 变成 `#NUM!` —— 那是新造的分歧。所以下面每一组都成对写。
//!
//! # 覆盖面
//!
//! `+` `-` `*` `/` 此前**一个都没有**闸门（`^` 有，且要额外把 `0^负数` 分流成
//! `#DIV/0!`，所以它保留自己的分支）。聚合侧 `SUM` / `PRODUCT` 的累加器同样会
//! 顶破 f64，一并收口 —— 否则「运算符报 `#NUM!`、聚合吐 `inf`」又是同一个引擎
//! 里的两种答案。
//!
//! # 为什么公式里一个 `1E308` 都不写
//!
//! 起初是**被迫**的：本引擎的解析器当时不认科学计数字面量，`=1E2` 是 `#VALUE!`
//! （`1` 后面跟了个叫 `E2` 的单元格引用），每一行都会先红在词法上，量不到闸门。
//! 那条词法分歧**现在已经修好**（`formula/lexer.rs` 的 `consume_exponent_suffix`，
//! 端到端钉子在 `tests/scientific_notation.rs`），`=1E308` 在这里已经能写了。
//!
//! 但下面**仍然一个都不改成 `1E308`**，理由变了：`10^308` 这类幂表达式同时
//! 覆盖了 `^` 自己的溢出路径（它是唯一一个此前就有闸门、且要额外把 `0^负数`
//! 分流成 `#DIV/0!` 的运算符）。换成字面量会把这一路覆盖白白丢掉 —— 那是削弱
//! 而不是简化。要加科学计数字面量的用例，往 `scientific_notation.rs` 加。
//!
//! # 为什么不碰非规格化数
//!
//! 下面的下溢用例一律取**真正等于 0** 的值（`1e-200 * 1e-200` = `1e-400`），
//! 不取 `1e-318` 这种非规格化数。MS 明文说 Excel **不**实现 IEEE 的
//! denormalized numbers（"Microsoft doesn't implement this optional portion of
//! the specification"），本引擎照 IEEE 原样保留 —— 那是一条独立分歧，本文件
//! 不替它下结论。

use einfach_core::{Value, ValueError};
use einfach_excel_core::{value_to_display, Workbook};

fn eval(formula: &str) -> Value {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", formula);
    wb.get_cell("Sheet1", "A1")
}

fn assert_overflow(formula: &str) {
    assert_eq!(
        eval(formula),
        Value::Error(ValueError::Overflow),
        "{formula} 溢出必须是 #NUM!"
    );
}

fn assert_number(formula: &str, expected: f64) {
    assert_eq!(
        eval(formula),
        Value::Number(expected),
        "{formula} 必须落地成一个数"
    );
}

/// 四个二元算术运算符各自的溢出路径。`^` 早就有闸门，这里一并钉住免得它被
/// 「统一」掉。
#[test]
fn every_arithmetic_operator_gates_overflow() {
    // 乘 —— 本待办的原始复现式（`=1E308*10` 的等价写法）。
    assert_overflow("=10^308*10");
    // 加 —— 只修乘法就会漏掉的那一条。9e307 + 9e307 = 1.8e308 > f64::MAX。
    assert_overflow("=9*10^307+9*10^307");
    // 减 —— 与加法对称，符号相反。
    assert_overflow("=(0-9*10^307)-9*10^307");
    // 除 —— 分母不为零，但商顶破了上界。
    assert_overflow("=10^308/10^-10");
    // 幂 —— 原本就有闸门。
    assert_overflow("=10^309");
}

/// `f64::MAX` 本身**允许**（MS 的 "Largest allowed positive number via
/// formula: 1.7976931348623158e+308" 写的就是它），所以闸门不能提前一格。
/// 值从单元格喂进来，绕开解析器不认科学计数这条独立缺陷。
#[test]
fn the_boundary_value_itself_is_allowed() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(f64::MAX));
    wb.set_formula(0, "B1", "=A1*1");
    wb.set_formula(0, "C1", "=A1+0");
    wb.set_formula(0, "D1", "=A1/1");
    // 差一个 ULP 就该报错：`f64::MAX` 再乘 1.0000001 就没有可表示的结果了。
    wb.set_formula(0, "E1", "=A1*1.0000001");

    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(f64::MAX));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(f64::MAX));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(f64::MAX));
    assert_eq!(
        wb.get_cell("Sheet1", "E1"),
        Value::Error(ValueError::Overflow)
    );
}

/// 下溢给 `0`，**不**报错 —— 与溢出方向相反的那一半。
#[test]
fn underflow_yields_zero_not_an_error() {
    assert_number("=10^-200*10^-200", 0.0);
    assert_number("=10^-300/10^100", 0.0);
    // 负数下溢在 IEEE 里是 `-0.0`。引擎的 `Value` 判等走 `to_bits()`（为了让
    // 不同来源的 NaN 不触发多余重算），所以 `-0.0` 与 `0.0` 在**值**这一层是
    // 两个东西 —— 这里不假装它们相等，而是钉住用户能观察到的两条：数值上等于
    // 零，且显示边界按 Excel「没有负零」收口成 `"0"`。
    match eval("=(0-10^-200)*10^-200") {
        Value::Number(n) => {
            assert!(n == 0.0, "下溢结果数值上必须等于零，得到 {n:e}");
            assert_eq!(value_to_display(&Value::Number(n)), "0");
        }
        other => panic!("下溢必须落地成一个数，得到 {other:?}"),
    }
}

/// 除以零仍然是 `#DIV/0!`，不能被新闸门吞成 `#NUM!` —— MS 明文
/// "Infinities occur when you divide by 0 ... it gives a `#DIV/0!` error"。
#[test]
fn division_by_zero_keeps_its_own_code() {
    assert_eq!(eval("=1/0"), Value::Error(ValueError::DivisionByZero));
    assert_eq!(eval("=0/0"), Value::Error(ValueError::DivisionByZero));
    // `0^负数` 也是除零，`Pow` 那条分流不能被 `is_finite` 抢先。
    assert_eq!(eval("=0^-1"), Value::Error(ValueError::DivisionByZero));
}

/// 聚合的累加器同样会溢出。走真实公式路径（区域引用），不是直接调函数实现。
#[test]
fn aggregates_gate_overflow_too() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(1.5e308));
    wb.set_cell(0, "A2", Value::Number(1.5e308));
    wb.set_formula(0, "B1", "=SUM(A1:A2)");
    wb.set_cell(0, "C1", Value::Number(1e300));
    wb.set_cell(0, "C2", Value::Number(1e300));
    wb.set_formula(0, "D1", "=PRODUCT(C1:C2)");
    // 不溢出的对照组：闸门不能把正常聚合也拦下来。
    wb.set_formula(0, "E1", "=SUM(C1:C2)");

    assert_eq!(
        wb.get_cell("Sheet1", "B1"),
        Value::Error(ValueError::Overflow),
        "SUM 的累加器溢出必须是 #NUM!"
    );
    assert_eq!(
        wb.get_cell("Sheet1", "D1"),
        Value::Error(ValueError::Overflow),
        "PRODUCT 的连乘溢出必须是 #NUM!"
    );
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Number(2e300));
}

/// 溢出值不能再从 `#NUM!` 变回一个能参与后续计算的数 —— 错误照常传播。
#[test]
fn overflow_propagates_like_any_other_error() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=10^308*10");
    wb.set_formula(0, "B1", "=A1+1");
    wb.set_formula(0, "C1", "=A1&\"\"");
    wb.set_formula(0, "D1", "=ISERROR(A1)");

    assert_eq!(
        wb.get_cell("Sheet1", "B1"),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Boolean(true));
}
