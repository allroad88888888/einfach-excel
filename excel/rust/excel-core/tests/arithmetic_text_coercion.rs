//! 算术语境下的「数值字符串」强制转换 + 后缀 `%` 运算符。
//!
//! 只钉这一件事：算术运算符（`+ - * / ^`、一元负号、后缀 `%`）怎么把
//! 非数字的 `Value` 变成 `f64`。函数实参与比较运算符走的是另一条转换
//! （`coerce_to_number`，不认文本），那条的行为在别处钉。
//!
//! 口径来自本仓的 TS 参考引擎 `excel-core-ts/src/eval/coerce.ts` 的
//! `toNumber`：`trim` 后空串 → `#VALUE!`，否则 `Number(trimmed)`，非有限
//! → `#VALUE!`。**不是** `str::parse::<f64>()` —— 两者实测差在
//! `0x`/`0b`/`0o` 前缀（JS 认、Rust 不认）与 `inf`/`nan` 拼写（Rust 认、
//! JS 不认）上，细节见 `eval.rs` 的 `coerce_text_to_number` 文档注释。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

fn eval(formula: &str) -> Value {
    let mut wb = Workbook::new();
    wb.set_formula(0, "Z99", formula);
    wb.get_cell("Sheet1", "Z99")
}

fn eval_with_a1(a1: Value, formula: &str) -> Value {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", a1);
    wb.set_formula(0, "Z99", formula);
    wb.get_cell("Sheet1", "Z99")
}

fn num(formula: &str) -> f64 {
    match eval(formula) {
        Value::Number(n) => n,
        other => panic!("{formula} 期望数字，实得 {other:?}"),
    }
}

// ── 缺口 1：数值字符串参与二元算术 ─────────────────────────────────────

#[test]
fn numeric_text_coerces_in_binary_arithmetic() {
    // 表头那两格：Excel = 6 / 15，TS 参考引擎同，Rust 侧过去是 #VALUE!。
    assert_eq!(num("=1+\"5\""), 6.0);
    assert_eq!(num("=\"5\"*\"3\""), 15.0);
    assert_eq!(num("=\"10\"-4"), 6.0);
    assert_eq!(num("=\"10\"/\"4\""), 2.5);
    assert_eq!(num("=\"2\"^\"10\""), 1024.0);
    // 单元格里的文本同样算数，不只是字面量。
    assert_eq!(
        eval_with_a1(Value::Text("5".into()), "=A1+1"),
        Value::Number(6.0)
    );
}

#[test]
fn non_numeric_text_is_still_value_error() {
    // `cross-engine-parity-smoke.test.ts` 的 M1/M2 钉着这两条。
    assert_eq!(eval("=1+\"x\""), Value::Error(ValueError::InvalidValue));
    assert_eq!(eval("=\"x\"+\"y\""), Value::Error(ValueError::InvalidValue));
}

/// 边界逐条核对。左列是输入文本，右列是 `=1*<text>` 的期望结果。
/// `None` = `#VALUE!`。每一行都对着 TS 侧 `toNumber` 实测过。
#[test]
fn text_to_number_boundary_table() {
    let cases: &[(&str, Option<f64>)] = &[
        // —— 两边一致的部分 ——
        ("5", Some(5.0)),
        (" 5 ", Some(5.0)),   // 前后空白：trim 掉
        ("\t5\n", Some(5.0)), // 制表符 / 换行也是空白
        ("+5", Some(5.0)),
        (" -5 ", Some(-5.0)),
        ("5.", Some(5.0)),
        (".5", Some(0.5)),
        ("1e3", Some(1000.0)), // 科学计数法：文本里认，数字字面量里不认
        ("1E3", Some(1000.0)),
        ("", None),         // 空串 —— JS `Number("")` 是 0，TS 有显式守卫
        (" ", None),        // 全空白同上
        ("5%", None),       // 百分号后缀：Excel 认，两个引擎都不认
        ("1,000", None),    // 千分位：同上
        ("$5", None),       // 货币符号：同上
        ("TRUE", None),     // 布尔文本不走算术转换（`toBoolean` 才认）
        ("Infinity", None), // `Number` 给 ∞，被 `isFinite` 挡掉
        ("-Infinity", None),
        ("1e999", None), // 溢出成 ∞，同样被挡
        ("1_000", None), // JS 数字分隔符在 `Number()` 里非法
        ("１", None),    // 全角数字
        ("٣", None),     // 阿拉伯-印度数字
        // —— Rust `parse::<f64>()` 会认、JS `Number()` 不认，必须拒 ——
        ("inf", None),
        ("-inf", None),
        ("infinity", None),
        ("NaN", None),
        ("nan", None),
        // —— JS `Number()` 认、Rust `parse::<f64>()` 不认，必须收 ——
        // ⚠️ 这三行是 oracle 与 Excel 不一致处：Excel 答 `#VALUE!`。
        // 按「与 TS 引擎逐格一致」取舍，要改就两侧同批改。
        ("0x10", Some(16.0)),
        ("0X10", Some(16.0)),
        ("0b101", Some(5.0)),
        ("0o17", Some(15.0)),
        ("-0x10", None), // 非十进制字面量不许带符号
        ("0x", None),    // 也不许没有数字
        // —— trim 集合的两处偏差（JS 空白 ≠ Unicode White_Space）——
        ("\u{feff}5", Some(5.0)), // BOM 是 JS 空白，Rust `trim` 不吃
        ("\u{85}5", None),        // NEL 是 Unicode 空白，JS 不认
    ];
    for (text, expected) in cases {
        let got = eval_with_a1(Value::Text((*text).into()), "=1*A1");
        match expected {
            Some(n) => assert_eq!(
                got,
                Value::Number(*n),
                "文本 {text:?} 应转成 {n}，实得 {got:?}"
            ),
            None => assert_eq!(
                got,
                Value::Error(ValueError::InvalidValue),
                "文本 {text:?} 应是 #VALUE!，实得 {got:?}"
            ),
        }
    }
}

/// 放宽只落在算术运算符上。比较运算符仍然走原来的
/// 「文本不可转数字 ⇒ 退化成文本比较」，这正是 Excel 的答案
/// （文本永远大于任何数字），一旦顺手把 `coerce_to_number` 也放宽就会红。
#[test]
fn comparison_semantics_unchanged_by_arithmetic_widening() {
    assert_eq!(eval("=\"5\"<10"), Value::Boolean(false));
    assert_eq!(eval("=\"5\">10"), Value::Boolean(true));
    assert_eq!(eval("=\"5\"=5"), Value::Boolean(true));
}

// ── 缺口 2：一元负号 ──────────────────────────────────────────────────

#[test]
fn unary_negate_coerces_numeric_text() {
    assert_eq!(num("=-\"5\""), -5.0);
    assert_eq!(num("=-\" -5 \""), 5.0);
    // 空单元格 → 0，布尔 → 1/0，与二元算术同一套规则。这两条过去也是
    // `#VALUE!`（`Expr::Negate` 只认 `Value::Number`），一起补上。
    // 负零：TS 侧 `-toNumber(blank)` 同样得 `-0`，两边一致；显示都是 "0"。
    // `Value` 的 `PartialEq` 比的是 `to_bits()`，所以这里必须写 `-0.0`。
    assert_eq!(eval_with_a1(Value::Null, "=-A1"), Value::Number(-0.0));
    assert_eq!(
        eval_with_a1(Value::Boolean(true), "=-A1"),
        Value::Number(-1.0)
    );
}

#[test]
fn unary_negate_on_non_numeric_text_is_still_value_error() {
    // `cross-engine-parity-smoke.test.ts` 的 M3 钉着这条。
    assert_eq!(eval("=-\"abc\""), Value::Error(ValueError::InvalidValue));
}

// ── 缺口 3：后缀 `%` ─────────────────────────────────────────────────

#[test]
fn percent_suffix_evaluates() {
    assert_eq!(num("=50%"), 0.5);
    assert_eq!(num("=-50%"), -0.5);
    assert_eq!(num("=50%%"), 0.005);
    assert_eq!(num("=1+2%"), 1.02);
    assert_eq!(num("=(1+2)%"), 0.03);
    // `%` 比 `^` 紧：`2^(2%)` = 2^0.02，不是 `(2^2)%` = 0.04。
    let pow = num("=2^2%");
    assert!(
        (pow - 2f64.powf(0.02)).abs() < 1e-12,
        "=2^2% 应是 2^0.02 ≈ {}, 实得 {pow}",
        2f64.powf(0.02)
    );
    assert_eq!(
        eval_with_a1(Value::Number(200.0), "=A1%"),
        Value::Number(2.0)
    );
}

#[test]
fn percent_shares_the_arithmetic_coercion() {
    assert_eq!(num("=\"50\"%"), 0.5);
    assert_eq!(eval("=\"abc\"%"), Value::Error(ValueError::InvalidValue));
    // 错误照常穿透，不会被 `/100` 吞掉。
    assert_eq!(eval("=(1/0)%"), Value::Error(ValueError::DivisionByZero));
}

/// `%` 是后缀一元，**不是**取模 —— Excel 根本没有取模运算符。
/// `=7%3` 因此不是 1，而是 `7%` 后面跟着一个悬空的 `3`，整条解析失败。
#[test]
fn percent_is_not_modulo() {
    assert_eq!(einfach_excel_core::parse_formula("=7%3"), None);
    // 取模要用 MOD()。
    assert_eq!(num("=MOD(7,3)"), 1.0);
}

/// `cross-engine-parity-smoke.test.ts` 的 `COERCION_CASES`（R1:R8）在
/// Rust 侧的那一半：同样的公式，同样的 display 字符串。那份跨引擎网要等
/// wasm 重建才跑得到，这里先把 Rust 侧钉住，重建后两边应当逐字相等。
#[test]
fn cross_engine_coercion_cases_display_identically() {
    let cases: &[(&str, &str)] = &[
        ("=1+\"5\"", "6"),
        ("=\"5\"*\"3\"", "15"),
        ("=\"10\"-4", "6"),
        ("=\" -5 \"+0", "-5"),
        ("=-\"5\"", "-5"),
        ("=50%", "0.5"),
        ("=-50%", "-0.5"),
        ("=50%%", "0.005"),
    ];
    for (formula, expected) in cases {
        let got = einfach_excel_core::value_to_display(&eval(formula));
        assert_eq!(&got, expected, "{formula} 的 display 应是 {expected:?}");
    }
}

/// 结构性编辑要能穿过 `Percent` 节点重写里面的引用，否则 `=B1%`
/// 在插入列之后会指错格子。
#[test]
fn percent_node_survives_structural_shift() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "B1", Value::Number(200.0));
    wb.set_formula(0, "D1", "=B1%");
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(2.0));
    wb.sheet_mut(0).expect("sheet").insert_col(0, 1);
    // B1 → C1，公式跟着改写；值不变。
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Number(2.0));
    assert_eq!(
        wb.sheet(0).expect("sheet").get_formula("E1"),
        Some("=C1%".to_string())
    );
}
