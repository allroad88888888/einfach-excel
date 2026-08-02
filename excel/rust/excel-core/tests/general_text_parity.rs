//! Excel「General」转文本规格的**预言机**。
//!
//! 这里的期望值不是「两个引擎跑出来一样」，而是 Excel 自己的答案：主表直接抄自
//! Apache POI 的 `NumberToTextConversionExamples`（POI 的注释写明该表是从 Excel
//! 实测观察抄回来的），POI 的 `NumberToTextConverter` 就是这条规格的公开反推。
//! 相等断言只能证明两侧一致，证明不了它们一起错 —— 所以这张表写字面量。
//!
//! 实现与规格说明在 `einfach_excel_core::general_text`；TS 参考引擎的孪生实现在
//! `excel/excel-core-ts/src/eval/general-text.ts`，它有一份逐行对应的表。

use einfach_core::Value;
use einfach_excel_core::{excel_general_to_text, Workbook};

/// 从 Excel 实测抄回的对照行：`(输入, Excel 给的文本)`。
///
/// 每一行都在钉一个具体的分歧点，不是随手取样：
/// - `1.2345678901234568e15` / `1.2345678901234567e19`：**大数门槛在指数 > 19**，
///   不在「16 位就转科学计数」。这两行是普通写法，第二行正好 20 字符。
/// - `1.2345678901234568e20`：越过门槛的第一步。
/// - `9.999999999999999e20`：收位进位把指数从 20 顶到 21，门槛判断必须发生在
///   收位**之后**。
/// - `1.2345678901234567e-4` / `1.2345678901234568e-5`：**小数门槛是 20 字符预算**
///   （`2 + 前导零 + 有效位`），不是某个固定指数。前者 20 字符留下，后者 21 超了。
/// - `5.67890123456e-8`：有效位少但前导零多，同样被预算挤进科学计数 —— 证明门槛
///   看的是总长度而不是指数本身。
/// - `1.2345678901234577e99` / `1.2345678901234576e100`：三位指数时有效数字降到
///   14 位，好让整串仍是 20 字符。
const EXCEL_OBSERVED: &[(f64, &str)] = &[
    (1.2345678901234567e7, "12345678.9012346"),
    (1.2345678901234568e13, "12345678901234.6"),
    (1.2345678901234567e14, "123456789012346"),
    (1.2345678901234568e15, "1234567890123460"),
    (1.2345678901234567e19, "12345678901234600000"),
    (1.2345678901234568e20, "1.23456789012346E+20"),
    (9.999999999999999e20, "1E+21"),
    (2.0e50, "2E+50"),
    (1.2345678901234577e99, "1.2345678901235E+99"),
    (1.2345678901234576e100, "1.2345678901235E+100"),
    (1.2345678901234567e-4, "0.000123456789012346"),
    (1.2345678901234568e-5, "1.23456789012346E-05"),
    (5.67890123456e-8, "5.67890123456E-08"),
];

#[test]
fn matches_excel_observed_renderings() {
    for (input, expected) in EXCEL_OBSERVED {
        assert_eq!(
            excel_general_to_text(*input),
            *expected,
            "input {input:e} rendered wrong"
        );
    }
}

/// 两侧门槛的确切位置。整十次幂最能暴露门槛，因为有效位恒为 1，长度完全由指数
/// 决定 —— 门槛挪一格这张表就整片红。
#[test]
fn power_of_ten_thresholds() {
    // 大数：指数 19 仍是普通写法（正好 20 字符），20 才转科学计数。
    assert_eq!(excel_general_to_text(1e14), "100000000000000");
    assert_eq!(excel_general_to_text(1e15), "1000000000000000");
    assert_eq!(excel_general_to_text(1e19), "10000000000000000000");
    assert_eq!(excel_general_to_text(1e20), "1E+20");
    assert_eq!(excel_general_to_text(1e21), "1E+21");

    // 小数：`2 + 前导零 + 1` 到 1e-18 时正好 20，1e-19 越预算。
    assert_eq!(excel_general_to_text(1e-4), "0.0001");
    assert_eq!(excel_general_to_text(1e-7), "0.0000001");
    assert_eq!(excel_general_to_text(1e-18), "0.000000000000000001");
    assert_eq!(excel_general_to_text(1e-19), "1E-19");
}

/// 15 位有效数字是硬上限：超出的位数被收掉再补零，而不是原样吐出 f64 的全部
/// 十进制位。`123456789012345678` 是本仓文档里被反复引用的那个例子。
#[test]
fn caps_at_fifteen_significant_digits() {
    assert_eq!(excel_general_to_text(123456789012345678.0), "123456789012346000");
    assert_eq!(excel_general_to_text(123456789012345678.0).len(), 18);
    assert_eq!(excel_general_to_text(1.0 / 3.0), "0.333333333333333");
    assert_eq!(excel_general_to_text(2.0 / 3.0), "0.666666666666667");
}

/// 收位顺带把二进制噪声抹掉了 —— 这是 Excel 用户看到 `0.3` 而不是
/// `0.30000000000000004` 的原因，也是尾随零必须先剪再计位数的原因。
#[test]
fn trims_binary_noise_and_trailing_zeros() {
    assert_eq!(excel_general_to_text(0.1 + 0.2), "0.3");
    assert_eq!(excel_general_to_text(1.005 * 100.0), "100.5");
    assert_eq!(excel_general_to_text(0.5), "0.5");
}

/// 指数一律带符号、至少两位，负号不占有效数字预算。
#[test]
fn exponent_and_sign_shape() {
    assert_eq!(excel_general_to_text(-1e21), "-1E+21");
    assert_eq!(excel_general_to_text(-1.5e-20), "-1.5E-20");
    assert_eq!(excel_general_to_text(1e-100), "1E-100");
    assert_eq!(excel_general_to_text(0.0), "0");
    assert_eq!(excel_general_to_text(-0.0), "0");
}

/// 单点的证明：`&` / `LEN` / `T` / `CONCAT` 走的是同一条规格，而不是各自
/// `format!("{}", n)`。跨引擎烟测里的 `GENERAL_TEXT_CASES` 用的就是这批公式，
/// 所以这里顺带确认 Rust 侧的解析器吃得下它们的写法。
#[test]
fn formula_paths_share_the_single_conversion() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=10^21&\"\"");
    wb.set_formula(0, "A2", "=LEN(10^21)");
    wb.set_formula(0, "A3", "=10^-7&\"\"");
    wb.set_formula(0, "A4", "=LEN(10^-7)");
    wb.set_formula(0, "A5", "=LEN(123456789012345678)");
    wb.set_formula(0, "A6", "=T(10^21&\"\")");
    wb.set_formula(0, "A7", "=CONCAT(0.1+0.2,\"|\",10^20)");
    wb.set_formula(0, "A8", "=0.5&\"\"");
    wb.set_formula(0, "A9", "=123456789012345678&\"\"");

    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("1E+21".into()));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("0.0000001".into()));
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(9.0));
    assert_eq!(wb.get_cell("Sheet1", "A5"), Value::Number(18.0));
    assert_eq!(wb.get_cell("Sheet1", "A6"), Value::Text("1E+21".into()));
    assert_eq!(wb.get_cell("Sheet1", "A7"), Value::Text("0.3|1E+20".into()));
    assert_eq!(wb.get_cell("Sheet1", "A8"), Value::Text("0.5".into()));
    assert_eq!(
        wb.get_cell("Sheet1", "A9"),
        Value::Text("123456789012346000".into())
    );
}
