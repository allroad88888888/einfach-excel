//! 显示层与 CSV 导出必须与公式侧共用**同一份** Excel General 转文本规格。
//!
//! # 这个文件在钉什么
//!
//! Rust 侧的数字→文本曾经有**三份**逐字节相同却互不调用的复制粘贴：
//!
//! | 位置 | 用途 |
//! |---|---|
//! | `eval::coerce_to_text` | `&` 拼接 / `LEN` / `T` / `CONCAT` |
//! | `format::default_number_string` | `value_to_display` + `NumberFormat` 兜底 |
//! | `csv::value_to_csv_field` | CSV 导出 |
//!
//! 三份都是 `if n == n.floor() && n.abs() < 1e15 { i64 } else { Display }`。
//! 只统一了第一份的那一程留下了一个用户可见的自相矛盾：`=10^21&""` 是
//! `1E+21`，而**裸的** `=10^21` 那格显示 `1000000000000000000000`（22 位十进制
//! 数字铺开，Excel 在这个量级上只用科学计数）。同一个数字、同一个引擎、两种
//! 写法 —— 复制粘贴的直接产物。
//!
//! 规格与依据（Apache POI 从 Excel 实测抄回的对照表）在
//! `einfach_excel_core::general_text` 的模块文档；那条规格本身的钉子在
//! `tests/general_text_parity.rs`。**本文件不重复那张表**，只钉「三条出口读到
//! 的是同一个答案」这一件事。
//!
//! # 为什么顺带钉筛选
//!
//! `filter.rs` 的谓词比对的字符串就是 `value_to_display` 的输出（`Workbook::
//! apply_filter` 从那里喂），而宿主 TS 侧的谓词读的是同一个函数经 wire 送出的
//! `display` 字段 —— E3 筛选下沉的行为保持性靠的正是「同一份字节」。所以显示
//! 一改，筛选匹配结果就会跟着改；下面把改变的方向写成字面量，免得它变成一次
//! 无人察觉的行为漂移。

use einfach_core::Value;
use einfach_excel_core::{
    export_csv, excel_general_to_text, filter_rule_matches_value, value_to_display, CellAddress,
    CellFormat, ColumnFilterRule, NumberFormat, Sheet, Workbook,
};

/// 三条出口在门槛两侧的字面量答案。左列是 Excel 的写法，不是任一宿主语言的。
///
/// 每一行钉一个具体分歧点：
/// - `1e19` / `1e20`：大数门槛在十进制指数 **> 19**。旧逻辑两行都铺开写。
/// - `1e21`：旧 Rust `Display` 给 22 位数字，旧 TS `String` 给 `1e+21`。
/// - `0.1 + 0.2`：旧逻辑原样吐 f64 的 17 位最短表示 `0.30000000000000004`；
///   15 位有效数字一收，二进制噪声就没了 —— Excel 用户看到的是 `0.3`。
/// - `123456789012345678`：16 位以上的整数要收到 15 位再补零。旧逻辑因为
///   `n.abs() < 1e15` 不成立而走 `Display`，原样吐 18 位。
/// - `1e-7` / `1e-19`：小数门槛是 20 字符预算，不是某个固定指数。
const DISPLAY_CASES: &[(f64, &str)] = &[
    (0.0, "0"),
    (-0.0, "0"),
    (42.0, "42"),
    (188.75, "188.75"),
    (1e19, "10000000000000000000"),
    (1e20, "1E+20"),
    (1e21, "1E+21"),
    (-1e21, "-1E+21"),
    (123456789012345678.0, "123456789012346000"),
    (1e-7, "0.0000001"),
    (1e-19, "1E-19"),
];

#[test]
fn value_to_display_speaks_the_excel_general_spec() {
    for (input, expected) in DISPLAY_CASES {
        assert_eq!(
            value_to_display(&Value::Number(*input)),
            *expected,
            "value_to_display({input:e})"
        );
    }
}

/// 单点的证明，不是「两份实现同判」的证明：显示层的每一个答案都必须与
/// `excel_general_to_text` **逐字节**相同。这条比上面那张表更强 —— 表只覆盖
/// 采样点，这条覆盖整个语料。
#[test]
fn display_is_byte_identical_to_the_single_conversion() {
    let corpus = [
        0.0,
        -0.0,
        1.0,
        -1.0,
        0.5,
        1.0 / 3.0,
        0.1 + 0.2,
        1e14,
        1e15,
        1e19,
        1e20,
        1e21,
        f64::MAX,
        1e-7,
        1e-18,
        1e-19,
        f64::MIN_POSITIVE,
        123456789012345678.0,
        -9.87654321e-13,
    ];
    for n in corpus {
        assert_eq!(
            value_to_display(&Value::Number(n)),
            excel_general_to_text(n),
            "display must delegate, not re-implement: {n:e}"
        );
    }
}

/// `NumberFormat::General` 与 `Date` / 自定义模式的兜底也走同一条路 ——
/// 它们本来就调用同一个 `default_number_string`，这里防的是「有人只改了
/// `value_to_display` 那一个分支」。
#[test]
fn number_format_general_and_fallbacks_share_the_spec() {
    let general = CellFormat::default();
    assert_eq!(general.format_number(1e21), "1E+21");

    let date = CellFormat {
        number_format: NumberFormat::Date("yyyy-mm-dd".into()),
        ..CellFormat::default()
    };
    assert_eq!(date.format_number(1e21), "1E+21");

    // 引号没闭合的模式 tokenize 不出来（`format_custom_number` → `None`），
    // 退回 General 兜底 —— 兜底那一支也必须走同一条规格。
    let custom = CellFormat {
        number_format: NumberFormat::Custom("\"".into()),
        ..CellFormat::default()
    };
    assert_eq!(custom.format_number(0.1 + 0.2), "0.3");
}

/// 端到端：**裸数字**公式那一格的显示。这是本轮修的用户可见症状 ——
/// `=10^21&""` 早就是 `1E+21` 了，`=10^21` 那格却还是 22 位数字。
#[test]
fn bare_number_cell_display_matches_the_concatenated_text() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=10^21");
    wb.set_formula(0, "A2", "=10^21&\"\"");
    wb.set_formula(0, "B1", "=0.1+0.2");
    wb.set_formula(0, "B2", "=(0.1+0.2)&\"\"");
    wb.set_formula(0, "C1", "=10^-19");
    wb.set_formula(0, "D1", "=123456789012345678");

    let display = |addr: &str| value_to_display(&wb.get_cell("Sheet1", addr));
    assert_eq!(display("A1"), "1E+21");
    assert_eq!(display("A1"), display("A2"), "裸数字与拼接文本必须同判");
    assert_eq!(display("B1"), "0.3");
    assert_eq!(display("B1"), display("B2"), "裸数字与拼接文本必须同判");
    assert_eq!(display("C1"), "1E-19");
    assert_eq!(display("D1"), "123456789012346000");
}

/// CSV 导出是第三条出口。它自己的模块注释写明「CSV 是一个**渲染**边界 ——
/// 字段就是用户在别的表格软件里打开会看到的东西」，那就必须和网格显示同判。
#[test]
fn csv_export_shares_the_same_spec() {
    let mut sheet = Sheet::new();
    sheet.set_formula("A1", "=10^21");
    sheet.set_formula("B1", "=0.1+0.2");
    sheet.set_formula("C1", "=10^-7");
    sheet.set_formula("D1", "=123456789012345678");

    let csv = export_csv(
        &mut sheet,
        CellAddress::parse("A1").expect("A1 parses"),
        CellAddress::parse("D1").expect("D1 parses"),
    );
    assert_eq!(csv.trim_end(), "1E+21,0.3,0.0000001,123456789012346000");
}

/// 筛选谓词读的就是 `value_to_display` 的字节，所以显示一改它就跟着改。
/// 方向写成字面量：改之后能按**用户看到的那个数**筛，改之前只能按 f64 的
/// 十七位噪声筛（没人会去输入 `0.30000000000000004`）。
#[test]
fn filter_predicate_sees_the_displayed_bytes() {
    let displayed = value_to_display(&Value::Number(0.1 + 0.2));
    assert_eq!(displayed, "0.3");

    let equals_rounded = ColumnFilterRule::Equals {
        col_index: 0,
        value: "0.3".into(),
        case_sensitive: false,
    };
    assert!(
        filter_rule_matches_value(&equals_rounded, &displayed),
        "筛 `0.3` 要能命中 `=0.1+0.2` 的格子"
    );

    let equals_raw_f64 = ColumnFilterRule::Equals {
        col_index: 0,
        value: "0.30000000000000004".into(),
        case_sensitive: false,
    };
    assert!(
        !filter_rule_matches_value(&equals_raw_f64, &displayed),
        "十七位噪声不再是可筛的字面量 —— 这是本次改动带来的行为变化，写死在这里"
    );
}
