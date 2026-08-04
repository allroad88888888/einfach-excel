//! 停泊态的字节级文本改写必须把 `'…'` 当**名字**，不是引用。
//!
//! `3743343` 让 `'My Sheet'!A1` 头一回解析得出来，随即暴露：停泊态
//! （`install_sheet_bulk`，从不 hydrate）的公式走文本改写，扫描器没有 `'`
//! 处理，于是表名里含**地址形状**时一次插行把表名本身改坏 ——
//! `'Q1 2024'!A1` → `'Q2 2024'!A1` → 那张表不存在 → `#REF!`。
//! hydrated 那条路（AST 渲染）一直是对的，坏的只有这条。
//!
//! 本文件是正向契约；引号扫描自身的边角（`''` 转义、未闭合、字符串字面量
//! 同形、贪吃回归）在 `parked_quoted_sheet_name_edges.rs`。

mod parked_quoted_support;

use einfach_core::Value;
use einfach_excel_core::{parse_formula, Workbook};
use parked_quoted_support::{
    addr, assert_byte_identical_under_all_ops, park, parked_text, quoted, wb_with_sheet, Op,
    ALL_OPS,
};
use std::collections::HashMap;

/// 表名清单：刻意都压在引号规则的边角上。写成**裸名字**再由测试自己加引号，
/// 这样「名字是什么」与「文本长什么样」两件事分得开。
const NAMES: &[&str] = &[
    "Q1 2024",   // 空格 + 前缀就是地址 Q1 —— 最初的复现
    "Sheet A1",  // 尾部就是一个地址
    "A1",        // 整个名字就是一个地址
    "A1:B2",     // 整个名字就是一个有界区间
    "1:3",       // 整个名字就是一个整行
    "A:C",       // 整个名字就是一个整列
    "$A$1",      // 带 `$` 的地址
    "B2",        // 与「表名长得像地址」的既有用例 `=B2!A1` 同形
    "My Sheet",  // 无地址形状 —— 修复前就好的对照组
    "销售 数据", // 非 ASCII 对照组
    "2024",      // 纯数字
];

// =====================================================================
// 表名本身：逐字节存活
// =====================================================================

/// 复现钉子：带地址形状的表名 × 四种结构编辑 × 五种引用尾巴，文本逐字节不变。
///
/// 修复前 `='Q1 2024'!A1` 一次 `insert_row` 就变成 `='Q2 2024'!A1`。
#[test]
fn quoted_sheet_names_survive_every_structural_op() {
    for name in NAMES {
        let q = quoted(name);
        for tail in ["A1", "A1:B2", "A:A", "1:3", "$A$1"] {
            assert_byte_identical_under_all_ops(&format!("={q}!{tail}"));
        }
    }
}

/// 同一条公式里**多个**带引号表名，一个都不许动。
#[test]
fn multiple_quoted_sheet_names_in_one_formula() {
    assert_byte_identical_under_all_ops("='A1'!B1+'B2'!C1");
    assert_byte_identical_under_all_ops("=SUM('Q1 2024'!A:A,'Sheet A1'!1:3,'A1'!$B$2)");
}

/// 带引号表名不带 `!`（解析器兜底成 `Expr::Name`）时同样是名字，不是引用。
#[test]
fn quoted_name_without_bang_is_still_a_name() {
    assert_byte_identical_under_all_ops("='A1'");
    assert_byte_identical_under_all_ops("=SUM('Q1 2024',1)");
}

// =====================================================================
// 跳过不许贪：引号外的同表引用照旧平移
// =====================================================================

/// 引号跳过只吃引号内的字节 —— 前后的同表引用该动还得动。
#[test]
fn same_sheet_refs_around_quoted_names_still_shift() {
    assert_eq!(
        parked_text("=E9+'A1'!B1+F9", Op::InsertRow),
        "=E10+'A1'!B1+F10"
    );
    assert_eq!(
        parked_text("=E9+'A1'!B1+F9", Op::InsertCol),
        "=F9+'A1'!B1+G9"
    );
    assert_eq!(
        parked_text("=SUM(E9:F9)+'Q1 2024'!A1", Op::DeleteRow),
        "=SUM(E8:F8)+'Q1 2024'!A1"
    );
}

/// 同表整轴与带引号跨表整轴同处一式：前者动、后者不动。
#[test]
fn same_sheet_whole_axis_shifts_next_to_a_quoted_cross_sheet_one() {
    assert_eq!(
        parked_text("=SUM(B:C)+SUM('A1'!B:C)", Op::InsertCol),
        "=SUM(C:D)+SUM('A1'!B:C)"
    );
    assert_eq!(
        parked_text("=SUM(2:3)+SUM('1:3'!2:3)", Op::InsertRow),
        "=SUM(3:4)+SUM('1:3'!2:3)"
    );
}

/// 引号跳过不得掩盖 `DeadRef`：同一条公式里带引号表名活着、同表引用死了，
/// 整条公式仍要变成 `#REF!`（与 hydrated 路径同口径）。
#[test]
fn dead_same_sheet_ref_after_a_quoted_name_still_kills_the_formula() {
    let mut wb = Workbook::new();
    let mut formulas: HashMap<_, String> = HashMap::new();
    formulas.insert(addr("C5"), "='A1'!B1+A1".to_string());
    wb.install_sheet_bulk(0, HashMap::new(), formulas)
        .expect("install");
    wb.sheet_mut(0).unwrap().delete_row(0, 1); // A1 所在行整行删掉

    let sheet = wb.sheet(0).unwrap();
    assert!(
        sheet.get_formula("C4").is_none(),
        "公式该被 #REF! 掉，却留着：{:?}",
        sheet.get_formula("C4")
    );
    assert_eq!(
        sheet.get_cell("C4"),
        Value::Error(einfach_core::ValueError::InvalidRef)
    );
}

// =====================================================================
// 改写之后还算得出来（文本对不对的最终裁判）
// =====================================================================

/// 求值级证明：编辑之后 `'Q1 2024'!A1` 仍指向那张真实存在的表。
///
/// 修复前这里会拿到 `#REF!` —— 表名被改成了不存在的 `Q2 2024`。
#[test]
fn quoted_sheet_ref_still_evaluates_after_an_edit() {
    let mut wb = wb_with_sheet("Q1 2024", "A1", 7.0);
    park(&mut wb, "='Q1 2024'!A1*2");
    wb.sheet_mut(0).unwrap().insert_row(0, 1);

    assert_eq!(
        wb.sheet(0).unwrap().get_formula("C6").as_deref(),
        Some("='Q1 2024'!A1*2")
    );
    assert_eq!(wb.get_cell("Sheet1", "C6"), Value::Number(14.0));
}

/// 名字整个就是一个地址（`'A1'`）时也一样 —— 这是最容易被改坏的一种。
#[test]
fn sheet_named_like_an_address_still_evaluates_after_an_edit() {
    let mut wb = wb_with_sheet("A1", "B1", 5.0);
    park(&mut wb, "='A1'!B1+E9");
    wb.sheet_mut(0).unwrap().insert_row(0, 1);

    assert_eq!(
        wb.sheet(0).unwrap().get_formula("C6").as_deref(),
        Some("='A1'!B1+E10")
    );
    assert_eq!(wb.get_cell("Sheet1", "C6"), Value::Number(5.0));
}

// =====================================================================
// 与 AST 侧引号规则的联结点
// =====================================================================

/// 两条路径对「名字到哪结束」必须给同一个答案。
///
/// 字节流扫描器（`parked_scan::scan_quoted_name_end`）与字符流扫描器
/// （`formula::quoted_name::Parser::scan_quoted_name`）是两份实现、只对齐
/// **语义**；这条用例是它们的联结点：AST 侧认得这条公式（解析得出来），
/// 字节侧认同整段名字都不是引用（文本逐字节不变）。两边对边界的理解一旦
/// 分家，含地址形状的名字立刻在这里露馅。
#[test]
fn byte_scanner_agrees_with_the_ast_scanner_on_where_a_name_ends() {
    for name in NAMES {
        let src = format!("={}!A1", quoted(name));
        assert!(
            parse_formula(&src).is_some(),
            "AST 侧解析不出来，用例本身站不住：{src}"
        );
        for op in ALL_OPS {
            let after = parked_text(&src, op);
            assert_eq!(after, src, "{op:?} 改写了 {src}");
            assert_eq!(
                parse_formula(&after),
                parse_formula(&src),
                "改写后与改写前不同树：{src} -> {after}"
            );
        }
    }
}
