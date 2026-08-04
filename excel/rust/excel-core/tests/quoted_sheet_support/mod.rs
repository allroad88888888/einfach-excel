//! 带引号表名两套用例（读侧 `quoted_sheet_name.rs` / 写侧
//! `quoted_sheet_name_render.rs`）共用的夹具。
//!
//! 两侧必须站在**同一份**表名集合上，否则「解析认得的形状」与「渲染写得出
//! 的形状」会各自漂移，而它们本该是同一条引号规则的两面。
//!
//! `tests/` 下的每个文件都是独立 crate，所以这里的每个条目对任一具体调用方
//! 都可能是未使用的；模块级 `allow(dead_code)` 是这个形状的代价，不是疏漏。
#![allow(dead_code)]

use einfach_core::Value;
use einfach_excel_core::Workbook;

/// `fixture()` 里 `My Sheet` 的表索引（0 号表是构造器自带的 Sheet1）。
pub const MY_SHEET: usize = 1;

/// Sheet1（公式所在表）+ 三张需要引号的表：
///
/// - `My Sheet` —— 带空格，最常见的一种。
/// - `It's` —— 名字里有单引号，写回时必须加倍成 `''`。
/// - `销售 数据` —— 非 ASCII 且带空格。
///
/// 三张表的 A 列刻意稀疏（A1、A3 有值、A2 空），与不带引号的跨表用例
/// （`cross_sheet_whole_axis.rs`）同形，便于逐条对照。`Plain` 是不需要引号
/// 的同形对照表。
pub fn fixture() -> Workbook {
    let mut wb = Workbook::new();
    for name in ["My Sheet", "It's", "销售 数据"] {
        let idx = wb.add_sheet(name);
        let s = wb.sheet_mut(idx).unwrap();
        s.set_cell("A1", Value::Number(1.0));
        s.set_cell("A3", Value::Number(3.0));
        s.set_cell("B1", Value::Number(100.0));
        s.set_cell("B3", Value::Number(300.0));
    }
    let plain = wb.add_sheet("Plain");
    let s = wb.sheet_mut(plain).unwrap();
    s.set_cell("A1", Value::Number(1.0));
    s.set_cell("A3", Value::Number(3.0));
    wb
}

/// 在 Sheet1!E1 装一条公式并取值。
pub fn eval(formula: &str) -> Value {
    let mut wb = fixture();
    wb.set_formula(0, "E1", formula);
    wb.get_cell("Sheet1", "E1")
}

/// 往返用例的表名清单：普通、带空格、带单引号（含名字整体就是引号）、以数字
/// 开头、下划线开头、中文（带空格与不带空格）、带 `.`、带 `!`、布尔同形。
pub const ROUND_TRIP_NAMES: &[&str] = &[
    "Sheet2",
    "My Sheet",
    "It's",
    "'",
    "2024Q1",
    "_data",
    "销售 数据",
    "销售数据",
    "Sheet.1",
    "A!B",
    "TRUE",
];
