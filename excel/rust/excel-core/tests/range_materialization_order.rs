//! 区域物化的顺序必须是**几何事实**（行主序坐标），而不是存储分桶的副产品。
//!
//! `Sheet` 把「字面量格」和「公式格」放在两张分开的表里（`interior.cells`
//! 与 `interior.formula_cells` / `formula_source`）。区域物化曾经先发完整张
//! 字面量表、再发整张公式表 —— 每张表各自是行主序，拼起来却不是。于是任何
//! **混了字面量和公式**的区域，公式格一律被排到序列最后。
//!
//! 这个两趟拼接有**两处**实现：`FacadeCtx::range_member_addrs`（公式求值真正
//! 走的那条，`AtomFormulaProvider::for_each_range_in` 用它）与
//! `Sheet::for_each_sparse_cell_with`（`SheetEvalProvider` / 工作簿 provider
//! 用它）。后者的注释明写「matching `for_each_sparse_cell_with` 的发射顺序」
//! —— 两处必须一起改，只改一处测试照样红。
//!
//! 动态数组（spill）是这个 bug 最容易撞上的形态：锚点 A1 落在 `formula_cells`，
//! 投影格 A2/A3 是装进 `cells` 的派生 atom，所以 `A1:A3` 会以 A2、A3、A1 的
//! 顺序发出。但根因与 spill 无关 —— 只要 A1 是普通公式、A2/A3 是字面量，
//! 同样翻车。
//!
//! 顺序敏感的消费者（`MATCH` / `XMATCH` / `CONCAT` / `CONCATENATE` /
//! `TEXTJOIN` / `NPV` / `SERIESSUM` / `XIRR`）走 `for_each_arg_value` →
//! `for_each_range_cell`，直接吃这个发射顺序；走 `runtime_ref_to_grid` 的
//! 那一大批（`SORT` / `FILTER` / `INDEX` / `TAKE` / …）按坐标回填格子，
//! 天然免疫。
//!
//! 见 `excel/rust/excel-core/src/sheet.rs` § `FacadeCtx::range_member_addrs`
//! 与 § `Sheet::for_each_sparse_cell_with`。

use std::collections::HashMap;

use einfach_core::Value;
use einfach_excel_core::{CellAddress, Sheet, Workbook};

/// 把公式装到 Z1（区域外）再读值，避免探针自己掉进被测区域。
fn probe(sheet: &mut Sheet, formula: &str) -> Value {
    assert!(sheet.set_formula("Z1", formula), "公式装不进去: {formula}");
    sheet.get_cell("Z1")
}

fn text(sheet: &mut Sheet, formula: &str) -> String {
    match probe(sheet, formula) {
        Value::Text(t) => t.to_string(),
        other => panic!("{formula} 期望 Text，得到 {other:?}"),
    }
}

fn number(sheet: &mut Sheet, formula: &str) -> f64 {
    match probe(sheet, formula) {
        Value::Number(n) => n,
        other => panic!("{formula} 期望 Number，得到 {other:?}"),
    }
}

/// A1..A3 = 1,2,3 三种铺法，值完全一样，只有存储分桶不同：
/// 全字面量 / A1 是 spill 锚点 / A1 是普通公式。三者答案必须一致。
fn literal_1_2_3() -> Sheet {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A2", Value::Number(2.0));
    sheet.set_cell("A3", Value::Number(3.0));
    sheet
}

fn spill_1_2_3() -> Sheet {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=SEQUENCE(3)"));
    sheet
}

fn formula_head_1_2_3() -> Sheet {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=1"));
    sheet.set_cell("A2", Value::Number(2.0));
    sheet.set_cell("A3", Value::Number(3.0));
    sheet
}

/// 反过来：公式在中间（A2），字面量在两头。
fn formula_middle_1_2_3() -> Sheet {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    assert!(sheet.set_formula("A2", "=2"));
    sheet.set_cell("A3", Value::Number(3.0));
    sheet
}

// === spill 锚点在区域内 —— 报的那三条 ===

#[test]
fn spill_anchor_keeps_row_major_position_in_match() {
    let mut sheet = spill_1_2_3();
    // A1=1 A2=2 A3=3，2 在第 2 个位置。锚点被排到最后时这里会答 1。
    assert_eq!(number(&mut sheet, "=MATCH(2,A1:A3,0)"), 2.0);
    assert_eq!(number(&mut sheet, "=MATCH(1,A1:A3,0)"), 1.0);
    assert_eq!(number(&mut sheet, "=MATCH(3,A1:A3,0)"), 3.0);
    // 升序近似匹配同样按位置返回。
    assert_eq!(number(&mut sheet, "=MATCH(3,A1:A3,1)"), 3.0);
}

#[test]
fn spill_anchor_keeps_row_major_position_in_concat() {
    let mut sheet = spill_1_2_3();
    assert_eq!(text(&mut sheet, "=CONCAT(A1:A3)"), "123");
}

#[test]
fn spill_anchor_keeps_row_major_position_in_textjoin() {
    let mut sheet = spill_1_2_3();
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A1:A3)"), "1,2,3");
}

/// 上一轮窄化探针留下的三条：只含投影格 / 只含锚点+1 格 / 区域比 spill 大。
#[test]
fn spill_partial_windows_keep_row_major_order() {
    let mut sheet = spill_1_2_3();
    // 纯投影格（锚点不在区域内）—— 一直是对的，钉住防回归。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A2:A3)"), "2,3");
    // 锚点 + 一格投影 —— 曾经是 "2,1"。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A1:A2)"), "1,2");
    // 区域比 spill 大，A4/A5 是空格，TEXTJOIN 忽略空 —— 曾经是 "2,3,1"。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A1:A5)"), "1,2,3");
}

// === 同一根因的非 spill 形态 ===

#[test]
fn plain_formula_cell_keeps_row_major_position() {
    // A1 是普通公式（跟 spill 无关），A2/A3 是字面量。
    let mut sheet = formula_head_1_2_3();
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A1:A3)"), "1,2,3");
    assert_eq!(text(&mut sheet, "=CONCAT(A1:A3)"), "123");
    assert_eq!(number(&mut sheet, "=MATCH(2,A1:A3,0)"), 2.0);

    // 公式在中间：曾经是 "1,3,2"。
    let mut mid = formula_middle_1_2_3();
    assert_eq!(text(&mut mid, "=TEXTJOIN(\",\",TRUE,A1:A3)"), "1,2,3");
    assert_eq!(number(&mut mid, "=MATCH(3,A1:A3,0)"), 3.0);
}

/// 二维区域也必须是行主序（先行后列），不是「字面量块 + 公式块」。
#[test]
fn two_dimensional_range_is_row_major() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", "=1"));
    sheet.set_cell("B1", Value::Number(2.0));
    sheet.set_cell("A2", Value::Number(3.0));
    assert!(sheet.set_formula("B2", "=4"));
    // 行主序：A1 B1 A2 B2 → 1,2,3,4。曾经是 2,3,1,4（两个字面量先走）。
    assert_eq!(text(&mut sheet, "=TEXTJOIN(\",\",TRUE,A1:B2)"), "1,2,3,4");
    assert_eq!(number(&mut sheet, "=MATCH(3,A1:B2,0)"), 3.0);
}

// === 其余顺序敏感的消费者 ===

#[test]
fn xmatch_keeps_row_major_position() {
    let mut spill = spill_1_2_3();
    assert_eq!(number(&mut spill, "=XMATCH(2,A1:A3)"), 2.0);
    let mut plain = formula_head_1_2_3();
    assert_eq!(number(&mut plain, "=XMATCH(2,A1:A3)"), 2.0);
}

#[test]
fn concatenate_keeps_row_major_order() {
    let mut sheet = formula_head_1_2_3();
    assert_eq!(text(&mut sheet, "=CONCATENATE(A1:A3)"), "123");
}

/// NPV 按位置贴现，顺序错了答案就错。1,2,3 @10%：
/// 1/1.1 + 2/1.21 + 3/1.331 = 4.815927873779113
#[test]
fn npv_discounts_by_row_major_position() {
    let expected = 1.0 / 1.1 + 2.0 / 1.1_f64.powi(2) + 3.0 / 1.1_f64.powi(3);
    let mut plain = formula_head_1_2_3();
    assert!((number(&mut plain, "=NPV(0.1,A1:A3)") - expected).abs() < 1e-12);
    let mut spill = spill_1_2_3();
    assert!((number(&mut spill, "=NPV(0.1,A1:A3)") - expected).abs() < 1e-12);
}

/// SERIESSUM(x=2, n=0, m=1, coef=1,2,3) = 1*2^0 + 2*2^1 + 3*2^2 = 17
#[test]
fn seriessum_uses_row_major_coefficient_order() {
    let mut plain = formula_head_1_2_3();
    assert_eq!(number(&mut plain, "=SERIESSUM(2,0,1,A1:A3)"), 17.0);
    let mut spill = spill_1_2_3();
    assert_eq!(number(&mut spill, "=SERIESSUM(2,0,1,A1:A3)"), 17.0);
}

/// XIRR 把 values 和 dates 按位置配对。dates 区域里混一个公式格时，
/// 日期序列被打乱成非递增，引擎直接报错 —— 顺序修好后应答出正常内部收益率。
#[test]
fn xirr_pairs_dates_by_row_major_position() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("B1", "=45000"));
    sheet.set_cell("B2", Value::Number(45010.0));
    sheet.set_cell("B3", Value::Number(45020.0));
    let mixed = probe(&mut sheet, "=XIRR({-100;50;80},B1:B3)");

    let mut all_literal = Sheet::new();
    all_literal.set_cell("B1", Value::Number(45000.0));
    all_literal.set_cell("B2", Value::Number(45010.0));
    all_literal.set_cell("B3", Value::Number(45020.0));
    let baseline = probe(&mut all_literal, "=XIRR({-100;50;80},B1:B3)");

    // 闭式基线：全字面量必须是个有限数（不是 #NUM!）。
    match baseline {
        Value::Number(n) => assert!(n.is_finite()),
        other => panic!("全字面量基线不该出错: {other:?}"),
    }
    assert_eq!(format!("{mixed:?}"), format!("{baseline:?}"));
}

// === bulk install 路径（跨引擎对拍用的就是这条） ===

/// 跨引擎对拍 harness 走 `bulk_install_workbook`（引擎侧
/// `Workbook::install_sheet_bulk`），公式源是**惰性**停在 `formula_source`
/// 而不是 `formula_cells`。归并必须把两张公式表和字面量表一起排 —— 只顾
/// `formula_cells` 的实现在这条路径上照样翻车。
#[test]
fn bulk_installed_range_is_row_major() {
    let addr = |s: &str| CellAddress::parse(s).expect("地址要能解析");
    let mut wb = Workbook::new();
    let primitives: HashMap<CellAddress, Value> = [
        (addr("CD2"), Value::Number(2.0)),
        (addr("CD3"), Value::Number(3.0)),
    ]
    .into_iter()
    .collect();
    let formulas: HashMap<CellAddress, String> = [
        // CC 列：spill 锚点 + 两格投影。
        (addr("CC1"), "=SEQUENCE(3)".to_string()),
        // CD 列：非 spill 的混合区域，公式在首格。
        (addr("CD1"), "=1".to_string()),
        // 探针。
        (addr("CF1"), "=MATCH(2,CC1:CC3,0)".to_string()),
        (addr("CF2"), "=CONCAT(CC1:CC3)".to_string()),
        (addr("CF3"), "=TEXTJOIN(\",\",TRUE,CC1:CC3)".to_string()),
        (addr("CF4"), "=TEXTJOIN(\",\",TRUE,CD1:CD3)".to_string()),
        (addr("CF5"), "=XMATCH(2,CC1:CC3)".to_string()),
        (addr("CF6"), "=SERIESSUM(2,0,1,CC1:CC3)".to_string()),
    ]
    .into_iter()
    .collect();
    wb.install_sheet_bulk(0, primitives, formulas)
        .expect("bulk install 要成功");

    assert_eq!(wb.get_cell("Sheet1", "CF1"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "CF2"), Value::Text("123".into()));
    assert_eq!(wb.get_cell("Sheet1", "CF3"), Value::Text("1,2,3".into()));
    assert_eq!(wb.get_cell("Sheet1", "CF4"), Value::Text("1,2,3".into()));
    assert_eq!(wb.get_cell("Sheet1", "CF5"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "CF6"), Value::Number(17.0));
}

// === 分桶不该被观测到：三种铺法答案必须逐条一致 ===

#[test]
fn storage_bucket_is_not_observable() {
    const CASES: &[&str] = &[
        "=MATCH(2,A1:A3,0)",
        "=MATCH(3,A1:A3,1)",
        "=XMATCH(2,A1:A3)",
        "=CONCAT(A1:A3)",
        "=CONCATENATE(A1:A3)",
        "=TEXTJOIN(\",\",TRUE,A1:A3)",
        "=NPV(0.1,A1:A3)",
        "=SERIESSUM(2,0,1,A1:A3)",
        "=SUM(A1:A3)",
        "=TEXTJOIN(\",\",TRUE,SORT(A1:A3,1,-1))",
    ];
    for case in CASES {
        let baseline = format!("{:?}", probe(&mut literal_1_2_3(), case));
        for (label, mut sheet) in [
            ("spill 锚点", spill_1_2_3()),
            ("公式在首格", formula_head_1_2_3()),
            ("公式在中间", formula_middle_1_2_3()),
        ] {
            let got = format!("{:?}", probe(&mut sheet, case));
            assert_eq!(got, baseline, "{case} 在「{label}」下与全字面量基线不一致");
        }
    }
}
