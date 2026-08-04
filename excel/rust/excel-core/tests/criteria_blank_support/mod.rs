//! 「空格判据」两个测试二进制共用的夹具。
//!
//! `criteria_blank_cardinality.rs`（数得对不对、整轴闭不闭式）与
//! `criteria_blank_value_ranges.rs`（值区那一侧取得对不对）共用同一份
//! `A1=1 / A2 空 / A3=3` 起始态和同一个探针位置。抄两份会让「非空格有几个」
//! 这个数各自漂移 —— 而整轴基数的断言正是靠它算出来的。
//!
//! `tests/` 下每个文件都是独立 crate，所以这里的条目对任一具体调用方都可能
//! 未使用；模块级 `allow(dead_code)` 是这个形状的代价，不是疏漏。
#![allow(dead_code)]

use einfach_core::Value;
use einfach_excel_core::Sheet;

/// 把公式装到 Z9（在被测区域之外）再读值。整列 / 整网格用例里 Z9 自己也是一个
/// 非空格，要算进基数 —— 整网格那条因此各用一张新表（Z9 会落进 `A:XFD`，
/// 同一张表上装第二条会撞自引用）。
pub fn probe(sheet: &mut Sheet, formula: &str) -> Value {
    assert!(sheet.set_formula("Z9", formula), "公式装不进去: {formula}");
    sheet.get_cell("Z9")
}

pub fn number(sheet: &mut Sheet, formula: &str) -> f64 {
    match probe(sheet, formula) {
        Value::Number(n) => n,
        other => panic!("{formula} 期望 Number，得到 {other:?}"),
    }
}

/// A1=1 / A2 空 / A3=3 ; B1=10 / B2=20 / B3=30。
///
/// 空格在**条件区**一侧，且它对应的值格是个实打实的数 —— 于是「条件区的空格
/// 算不算命中」这件事在值区那侧看得见（`SUMIF(A1:A3,"",B1:B3)` 答 20 还是 0）。
/// A 列非空 2 格，整轴基数的断言都从这个 2 来。
pub fn hole_in_the_middle() -> Sheet {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A3", Value::Number(3.0));
    sheet.set_cell("B1", Value::Number(10.0));
    sheet.set_cell("B2", Value::Number(20.0));
    sheet.set_cell("B3", Value::Number(30.0));
    sheet
}
