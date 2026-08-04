//! 两个「整域拒绝」闸门必须对同一个矩形给出同一个答案。
//!
//! ADR 0006（`docs/decisions/0006-spill-region-write-semantics.md`）把单格输入
//! 放宽到了 Excel 语义（写入生效、anchor 变 `#SPILL!`），但在「明确非目标」一节
//! 里把 `sort.rs` 的 `SpillIntersectsRange` 与 `auto_fill.rs` 的 `SpillTarget`
//! 钉成**整体拒绝** —— Excel 对「排序/填充跨越数组边界」同样整体拒绝。
//!
//! 两个闸门各自算各自的：`sort_spill_intersecting` 遍历 `spill_anchor_addr`，
//! 拿 anchor + 形状拼出矩形；auto-fill 则逐格问 `Sheet`。口径一旦分叉，同一个
//! 工作簿状态上「排序被拒 / 填充放行」就会出现 —— 而放行的那一侧是**带成功
//! 计数的数据丢失**（整个数组被拆掉）。本文件只做一件事：把两侧钉在一起。
//!
//! 闸门各自的边界用例（哪个 planner、报哪个地址、源区不设闸）留在
//! `auto_fill.rs` 与 `sort.rs` 各自的单测里；这里只测**两者一致**。

use std::sync::Arc;

use einfach_core::{ArrayData, Value};
use einfach_excel_core::{
    AutoFillDirection, AutoFillRequest, AutoFillSeries, CellAddress, CellRange, SortDirection,
    SortKey, Workbook,
};

fn addr(value: &str) -> CellAddress {
    CellAddress::parse(value).expect("test address")
}

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end))
}

fn asc(col: u32) -> SortKey {
    SortKey {
        col,
        direction: SortDirection::Ascending,
        case_sensitive: false,
    }
}

/// 在 `anchor` 装一个 `values.len() x 1` 的数组：`anchor` 是 spill anchor，
/// 其下各行是投影格。
fn spill_column(wb: &mut Workbook, anchor: &str, values: &[f64]) {
    let data: Vec<Value> = values.iter().copied().map(Value::Number).collect();
    wb.sheet_mut(0)
        .unwrap()
        .set_array(
            anchor,
            Arc::new(ArrayData::new(values.len() as u32, 1, data)),
        )
        .expect("array install");
}

fn fill(
    wb: &mut Workbook,
    source: (&str, &str),
    target: (&str, &str),
    dir: AutoFillDirection,
) -> bool {
    wb.apply_auto_fill(&AutoFillRequest {
        sheet_idx: 0,
        source_range: range(source.0, source.1),
        target_range: range(target.0, target.1),
        direction: dir,
        series: AutoFillSeries::Copy,
        step: None,
        text_pattern: None,
        list: None,
    })
    .is_ok()
}

fn sort(wb: &mut Workbook, r: (&str, &str), key_col: u32) -> bool {
    wb.sheet_mut(0)
        .unwrap()
        .sort_range(range(r.0, r.1), &[asc(key_col)], &[])
        .is_ok()
}

/// 写入矩形只盖住**活 anchor 本身**，不含任何投影格。
///
/// 这是两个闸门历史上分叉的那一格：`is_spilled` 按定义排除 anchor，所以
/// auto-fill 曾经放行并把整个数组拆掉（`written: 1` —— 带成功计数的数据丢失），
/// 而 sort 的矩形从 anchor 起算，同一个矩形直接拒。
#[test]
fn a_bare_live_anchor_is_refused_by_both_gates() {
    // sort 侧：A1:A2 只碰到 anchor A2。
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    spill_column(&mut wb, "A2", &[10.0, 20.0, 30.0]); // A2:A4
    assert!(
        !sort(&mut wb, ("A1", "A2"), 0),
        "sort 必须拒绝只碰 anchor 的矩形"
    );

    // auto-fill 侧：同一个工作簿状态，write_range 也是 A2:A2。
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    spill_column(&mut wb, "A2", &[10.0, 20.0, 30.0]);
    assert!(
        !fill(&mut wb, ("A1", "A1"), ("A1", "A2"), AutoFillDirection::Down),
        "auto-fill 必须拒绝只碰 anchor 的矩形（与 sort 同口径）"
    );

    // 拒绝是整体的：数组完好，一个格子都没写。anchor 上 `peek_value` 读到的是
    // 未塌缩的 `Value::Array` 本身，所以形状用 `spill_info` 验。
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.spill_info(addr("A2")), Some((3, 1)));
    assert_eq!(sheet.peek_value(addr("A4")), Value::Number(30.0));
    assert_eq!(sheet.debug_spill_anchor_count(), 1);
    assert_eq!(sheet.debug_spill_target_count(), 2);
}

/// 分叉的现实形态：横向拖动跨过一个**纵向**数组。
///
/// 拖 1 行只碰到 anchor（曾经放行、数组被毁），拖 2 行碰到投影格（拒）。同一次
/// 手势差一行给出相反答案，是这条不一致最容易被用户撞上的样子。
#[test]
fn a_horizontal_fill_crossing_a_vertical_anchor_row_is_refused_like_the_row_below() {
    for (source, target, anchor_row_case) in [
        (("A1", "B1"), ("A1", "E1"), true), // write_range C1:E1 —— 含 anchor C1
        (("A2", "B2"), ("A2", "E2"), false), // write_range C2:E2 —— 含投影格 C2
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(1.0));
        wb.set_cell(0, "B1", Value::Number(2.0));
        wb.set_cell(0, "A2", Value::Number(1.0));
        wb.set_cell(0, "B2", Value::Number(2.0));
        spill_column(&mut wb, "C1", &[10.0, 20.0, 30.0]); // C1:C3

        assert!(
            !fill(&mut wb, source, target, AutoFillDirection::Right),
            "anchor 行与投影行必须同判（anchor 行? {anchor_row_case}）"
        );
        // 数组完好。
        let sheet = wb.sheet(0).unwrap();
        assert_eq!(sheet.spill_info(addr("C1")), Some((3, 1)));
        assert_eq!(sheet.peek_value(addr("C3")), Value::Number(30.0));
    }
}

/// 对照组：投影格。两个闸门在这一格上从来一致，钉住它，免得修 anchor 时把
/// 已经对的那半边改坏。
#[test]
fn a_projection_cell_is_refused_by_both_gates() {
    let mut wb = Workbook::new();
    spill_column(&mut wb, "A5", &[1.0, 2.0, 3.0]); // A5:A7
    wb.set_cell(0, "A8", Value::Number(9.0));
    assert!(!sort(&mut wb, ("A7", "A9"), 0));

    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    spill_column(&mut wb, "A4", &[1.0, 2.0, 3.0]); // A4:A6
    assert!(!fill(
        &mut wb,
        ("A1", "A1"),
        ("A1", "A6"),
        AutoFillDirection::Down
    ));
}

/// 对照组：碰撞态（`#SPILL!`）anchor 的「本该占据」矩形，两个闸门都**放行**
/// —— 这是刻意的，不是漏判。
///
/// 碰撞的 anchor 一格都没装（`register_spill` 在第一趟就 `Err`，什么都没登记），
/// 它矩形里的格子全是用户自己的普通单元格，其中就有那个阻塞物。把它们设成闸门
/// 会让「用填充/排序挪走阻塞物」变成不可能 —— 而那正是 ADR 0006 阶段 2 复活路径
/// 要走的路。所以两个闸门都只认**已装成**的 spill（`spill_targets` /
/// `spill_anchor_addr`），不认 Blocked claims。
#[test]
fn a_blocked_anchor_rectangle_is_accepted_by_both_gates() {
    // A1 = =SEQUENCE(3) 想要 A1:A3，被 A2 挡住 → A1 是 `#SPILL!`，claims 覆盖 A2/A3。
    let mut wb = Workbook::new();
    wb.set_cell(0, "A2", Value::Number(5.0));
    wb.set_formula(0, "A1", "=SEQUENCE(3)");
    wb.set_cell(0, "A4", Value::Number(1.0));
    {
        let sheet = wb.sheet(0).unwrap();
        assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1);
        assert_eq!(sheet.debug_spill_anchor_count(), 0, "碰撞态不装任何投影");
    }
    assert!(
        sort(&mut wb, ("A2", "A4"), 0),
        "sort 不该被 Blocked claims 拦住"
    );

    let mut wb = Workbook::new();
    wb.set_cell(0, "A2", Value::Number(5.0));
    wb.set_formula(0, "A1", "=SEQUENCE(3)");
    assert!(
        fill(&mut wb, ("A2", "A2"), ("A2", "A3"), AutoFillDirection::Down),
        "auto-fill 不该被 Blocked claims 拦住"
    );

    // 连 `#SPILL!` 的 anchor 格本身也不设闸：它就是一个普通公式格。
    let mut wb = Workbook::new();
    wb.set_cell(0, "B2", Value::Number(5.0));
    wb.set_formula(0, "B1", "=SEQUENCE(3)");
    wb.set_cell(0, "A1", Value::Number(9.0));
    wb.set_cell(0, "A2", Value::Number(1.0));
    assert!(sort(&mut wb, ("A1", "B2"), 0));
}

/// 三个 planner 形状（`plan_copy` / `plan_numeric_series` / `plan_generated`）
/// 共用同一个谓词，所以裸 anchor 在三条路上都必须被拒。
#[test]
fn all_three_planner_shapes_refuse_a_bare_anchor() {
    // plan_copy —— 见 `a_bare_live_anchor_is_refused_by_both_gates`，此处补另外两条。

    // plan_numeric_series：源必须是规范数列才能走到闸门。
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.set_cell(0, "A2", Value::Number(2.0));
    spill_column(&mut wb, "A3", &[10.0, 20.0]); // anchor A3，投影 A4
    assert!(wb
        .apply_auto_fill(&AutoFillRequest {
            sheet_idx: 0,
            source_range: range("A1", "A2"),
            target_range: range("A1", "A3"), // write_range A3:A3 —— 只有 anchor
            direction: AutoFillDirection::Down,
            series: AutoFillSeries::IntegerStep,
            step: Some(1.0),
            text_pattern: None,
            list: None,
        })
        .is_err());
    assert_eq!(
        wb.sheet(0).unwrap().peek_value(addr("A4")),
        Value::Number(20.0),
        "整体拒绝：投影格没被牵连"
    );

    // plan_generated（线性趋势代表全家）。
    let mut wb = Workbook::new();
    for (cell, value) in [("D1", 1.0), ("D2", 2.0), ("D3", 3.0)] {
        wb.set_cell(0, cell, Value::Number(value));
    }
    spill_column(&mut wb, "D4", &[10.0, 20.0]); // anchor D4，投影 D5
    assert!(wb
        .apply_auto_fill(&AutoFillRequest {
            sheet_idx: 0,
            source_range: range("D1", "D3"),
            target_range: range("D1", "D4"), // write_range D4:D4 —— 只有 anchor
            direction: AutoFillDirection::Down,
            series: AutoFillSeries::LinearTrend,
            step: Some(1.0),
            text_pattern: None,
            list: None,
        })
        .is_err());
    assert_eq!(
        wb.sheet(0).unwrap().peek_value(addr("D5")),
        Value::Number(20.0)
    );
}
