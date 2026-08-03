//! 区域里的**空格照样占一格**：位置是几何事实（相对区域起点的行主序偏移），
//! 不是「第几个格子被发出来」。
//!
//! 根因：`EvalProvider::for_each_range_cell` 的契约是**只发非空格** ——
//! `SheetEvalProvider` / `AtomFormulaProvider` / 工作簿 provider 都走稀疏遍历，
//! 空格连回调都不进。于是「回调里 `position += 1`」这种写法数的是**发出来的
//! 格子数**，空格白白丢掉一个位次：`A1=1 / A2 空 / A3=3` 时
//! `=MATCH(3,A1:A3,0)` 答 2，而 Excel（以及本仓的 TS 参考引擎、以及同一个
//! 引擎里等价的数组字面量形态）答 3。
//!
//! 受影响的是**把序号当结果交出去**的函数 —— `MATCH` / `XMATCH` 的返回值、
//! `SERIESSUM` 的系数指数。走 `runtime_ref_to_grid`（按坐标回填格子）的那一大批
//! （`VLOOKUP` / `LOOKUP` / `XLOOKUP` / `INDEX` / `SORT` / `FILTER` / `CORREL`
//! 一族）天然免疫；只做聚合、计数、排序的（`SUM` / `COUNT` / `LARGE` / `SMALL` /
//! `RANK` / `PERCENTRANK` / `MODE.MULT`）答案与空格占不占位无关，也不受影响。
//!
//! 与 `tests/range_materialization_order.rs` 的分工：那份管**发射顺序**（混了
//! 字面量和公式的区域必须按行主序发），这份管**位置口径**（没发出来的空格
//! 也要占位次）。两条都是同一个消费者面（`for_each_arg_value` 那一支）的属性，
//! 但根因不同，坏掉的方式也不同。

use std::collections::HashMap;

use einfach_core::Value;
use einfach_excel_core::{CellAddress, Sheet, Workbook};

/// 把公式装到 Z9（远离被测区域）再读值，避免探针自己掉进区域里。
fn probe(sheet: &mut Sheet, formula: &str) -> Value {
    assert!(sheet.set_formula("Z9", formula), "公式装不进去: {formula}");
    sheet.get_cell("Z9")
}

fn number(sheet: &mut Sheet, formula: &str) -> f64 {
    match probe(sheet, formula) {
        Value::Number(n) => n,
        other => panic!("{formula} 期望 Number，得到 {other:?}"),
    }
}

/// A1=1 / A2 空 / A3=3 —— 本文件的基本形状。
fn hole_in_the_middle() -> Sheet {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A3", Value::Number(3.0));
    sheet
}

#[test]
fn match_counts_the_hole_in_a_single_column() {
    let mut sheet = hole_in_the_middle();
    // A3 是区域的第 3 格，不是「第 2 个发出来的格子」。
    assert_eq!(number(&mut sheet, "=MATCH(3,A1:A3,0)"), 3.0);
    // 空格之前的格子不受影响 —— 位置口径改的是「之后」。
    assert_eq!(number(&mut sheet, "=MATCH(1,A1:A3,0)"), 1.0);
    // 区域尾部再多两格空的，命中位置不动。
    assert_eq!(number(&mut sheet, "=MATCH(3,A1:A5,0)"), 3.0);
    assert_eq!(number(&mut sheet, "=XMATCH(3,A1:A3)"), 3.0);
}

#[test]
fn match_position_is_relative_to_the_range_start_not_the_sheet() {
    let mut sheet = Sheet::new();
    // A2 空 / A3=7 / A4=9。区域从 A2 起算，所以 A3 是第 2 格。
    sheet.set_cell("A3", Value::Number(7.0));
    sheet.set_cell("A4", Value::Number(9.0));
    assert_eq!(number(&mut sheet, "=MATCH(7,A2:A4,0)"), 2.0);
    assert_eq!(number(&mut sheet, "=MATCH(9,A2:A4,0)"), 3.0);
    // 同一格换个起点就换个位次 —— 位置是相对量。
    assert_eq!(number(&mut sheet, "=MATCH(7,A3:A4,0)"), 1.0);
    assert_eq!(number(&mut sheet, "=XMATCH(7,A2:A4)"), 2.0);
}

/// 二维区域按**行主序**数：`A1:B3` 的位次是
/// A1=1 B1=2 / A2=3 B2=4 / A3=5 B3=6，空格照样占号。
#[test]
fn match_counts_holes_row_major_in_a_2d_range() {
    let mut sheet = Sheet::new();
    // B1 与 A2 是空的。
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B2", Value::Number(2.0));
    sheet.set_cell("A3", Value::Number(3.0));
    sheet.set_cell("B3", Value::Number(4.0));
    assert_eq!(number(&mut sheet, "=MATCH(1,A1:B3,0)"), 1.0);
    assert_eq!(number(&mut sheet, "=MATCH(2,A1:B3,0)"), 4.0);
    assert_eq!(number(&mut sheet, "=MATCH(3,A1:B3,0)"), 5.0);
    assert_eq!(number(&mut sheet, "=MATCH(4,A1:B3,0)"), 6.0);
    assert_eq!(number(&mut sheet, "=XMATCH(4,A1:B3)"), 6.0);
}

/// 二维时「行主序」与「列主序」会给出不同的答案，所以要有一条能把两者分开的
/// 断言：B2 在行主序里是第 4 格，在列主序里是第 5 格。
#[test]
fn two_dimensional_position_is_row_major_not_column_major() {
    let mut sheet = Sheet::new();
    sheet.set_cell("B2", Value::Number(42.0));
    assert_eq!(
        number(&mut sheet, "=MATCH(42,A1:B3,0)"),
        4.0,
        "行主序：A1=1 B1=2 A2=3 B2=4；列主序会答 5"
    );
}

/// `XMATCH` 的每种 search_mode / match_mode 都必须报同一套位置口径 —— 正向、
/// 反向、二分、最近小、最近大走的是四段不同的代码，但位次来源必须只有一个。
#[test]
fn xmatch_reports_absolute_positions_in_every_search_mode() {
    let mut sheet = Sheet::new();
    // A1=1 / A2 空 / A3=3 / A4=5（升序，二分模式可用）。
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A3", Value::Number(3.0));
    sheet.set_cell("A4", Value::Number(5.0));
    // 正向精确。
    assert_eq!(number(&mut sheet, "=XMATCH(3,A1:A4)"), 3.0);
    // 反向精确（search_mode = -1）。
    assert_eq!(number(&mut sheet, "=XMATCH(3,A1:A4,0,-1)"), 3.0);
    // 升序二分（search_mode = 2）。
    assert_eq!(number(&mut sheet, "=XMATCH(3,A1:A4,0,2)"), 3.0);
    // 最近小（match_mode = -1）：4 落在 3 上 → 第 3 格。
    assert_eq!(number(&mut sheet, "=XMATCH(4,A1:A4,-1)"), 3.0);
    // 最近大（match_mode = 1）：4 落在 5 上 → 第 4 格。
    assert_eq!(number(&mut sheet, "=XMATCH(4,A1:A4,1)"), 4.0);
}

/// `SERIESSUM(x, n, m, coefs)` 的第 i 个系数带指数 `n + i*m`，i 是系数在区域里的
/// **位置**。空格是「系数 0」，它必须占掉自己那一档指数。
#[test]
fn seriessum_blank_coefficient_keeps_its_exponent_slot() {
    let mut sheet = Sheet::new();
    // A1=1 / A2 空 / A3=1 → 1*2^0 + 0*2^1 + 1*2^2 = 5。
    // 空格不占位的话答的是 1*2^0 + 1*2^1 = 3。
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A3", Value::Number(1.0));
    assert_eq!(number(&mut sheet, "=SERIESSUM(2,0,1,A1:A3)"), 5.0);
    // 同一份系数写成稠密的数组字面量，答案必须一致 —— 这是同一个引擎内部
    // 「区域形态」与「数组形态」自相矛盾的那一刀。
    assert_eq!(number(&mut sheet, "=SERIESSUM(2,0,1,{1,0,1})"), 5.0);
}

#[test]
fn seriessum_counts_2d_coefficient_blocks_row_major() {
    let mut sheet = Sheet::new();
    // A1=1 / B1 空 / A2 空 / B2=1 → 指数 0..3，只有 i=0 与 i=3 有系数：
    // 1*2^0 + 1*2^3 = 9。
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B2", Value::Number(1.0));
    assert_eq!(number(&mut sheet, "=SERIESSUM(2,0,1,A1:B2)"), 9.0);
}

/// 整列引用把结束行写成 `u32::MAX` 哨兵。位置计算必须能吃下它（列宽夹成 1），
/// 而不是溢出或按哨兵去乘。
#[test]
fn full_column_reference_still_counts_holes() {
    let mut sheet = hole_in_the_middle();
    assert_eq!(number(&mut sheet, "=MATCH(3,A:A,0)"), 3.0);
    assert_eq!(number(&mut sheet, "=XMATCH(3,A:A)"), 3.0);
}

/// 跨表区域走的是 `for_each_sheet_range_cell`，与同表那条不是同一段代码。
#[test]
fn cross_sheet_range_counts_holes_too() {
    let mut wb = Workbook::new();
    let sheet2 = wb.add_sheet("Sheet2");
    // Sheet2!A1=1 / A2 空 / A3=3。
    wb.set_cell(sheet2, "A1", Value::Number(1.0));
    wb.set_cell(sheet2, "A3", Value::Number(3.0));
    assert!(wb.set_formula(0, "B1", "=MATCH(3,Sheet2!A1:A3,0)"));
    assert!(wb.set_formula(0, "B2", "=XMATCH(3,Sheet2!A1:A3)"));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(3.0));
}

/// bulk install 路径（跨引擎对拍 harness 走的那条）上公式源惰性停在
/// `formula_source`，空格同样不会被发出来 —— 位置口径必须一致。
#[test]
fn bulk_installed_range_counts_holes() {
    let addr = |s: &str| CellAddress::parse(s).expect("地址要能解析");
    let mut wb = Workbook::new();
    let primitives: HashMap<CellAddress, Value> = [
        (addr("CH1"), Value::Number(1.0)),
        // CH2 刻意留空。
        (addr("CH3"), Value::Number(3.0)),
    ]
    .into_iter()
    .collect();
    let formulas: HashMap<CellAddress, String> = [
        (addr("CJ1"), "=MATCH(3,CH1:CH3,0)".to_string()),
        (addr("CJ2"), "=XMATCH(3,CH1:CH3)".to_string()),
        (addr("CJ3"), "=SERIESSUM(2,0,1,CH1:CH3)".to_string()),
    ]
    .into_iter()
    .collect();
    wb.install_sheet_bulk(0, primitives, formulas)
        .expect("bulk install 要成功");

    assert_eq!(wb.get_cell("Sheet1", "CJ1"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "CJ2"), Value::Number(3.0));
    // 1*2^0 + 0*2^1 + 3*2^2 = 13。
    assert_eq!(wb.get_cell("Sheet1", "CJ3"), Value::Number(13.0));
}

/// 位置口径改了，**不该**动到那些与空格占位无关的函数。这条是反向围栏：
/// 同一份带洞的数据上，聚合 / 计数 / 排序 / 按坐标回填的一族答案不变。
#[test]
fn hole_position_fix_does_not_disturb_the_immune_family() {
    let mut sheet = hole_in_the_middle();
    // 聚合：空格本来就不参与。
    assert_eq!(number(&mut sheet, "=SUM(A1:A3)"), 4.0);
    assert_eq!(number(&mut sheet, "=COUNT(A1:A3)"), 2.0);
    assert_eq!(number(&mut sheet, "=LARGE(A1:A3,1)"), 3.0);
    assert_eq!(number(&mut sheet, "=SMALL(A1:A3,1)"), 1.0);
    assert_eq!(number(&mut sheet, "=RANK(3,A1:A3)"), 1.0);
    // 按坐标回填的一族：空格是 grid 里的 Null，本来就占位。
    assert_eq!(number(&mut sheet, "=INDEX(A1:A3,3)"), 3.0);
    assert_eq!(number(&mut sheet, "=LOOKUP(3,A1:A3)"), 3.0);
    assert_eq!(number(&mut sheet, "=XLOOKUP(3,A1:A3,A1:A3)"), 3.0);
}
