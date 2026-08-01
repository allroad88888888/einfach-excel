//! ADR 0006 阶段 0/2 —— `sort_range` 搬动**碰撞态**（`#SPILL!`）anchor 之后，
//! 必须像结构编辑一样重投影，并把 blocked-claims 登记表按新地址重键。
//!
//! `sort.rs` §5.1 的闸门只遍历 `spill_anchor_addr` —— 那是**已安装**投影的索引。
//! 碰撞态 anchor 什么都没装，所以闸门看不见它，排序被放行；这是**有意的**：
//! `sheet_spill.rs::is_spill_region` 明写「collided anchor 必须读 false，好让
//! sort/fill 有机会挪走阻塞物」，正是阶段 2 复活路径的前提。放行之后欠的那一步
//! 才是缺陷：排序既不重投影、也不重键登记表。
//!
//! 与邻居的分工：`spill_blocked_anchor_structural.rs` 管插删行列（那条路已经走
//! `teardown_blocked_spill_anchors` → `rederive_spill_anchors`），
//! `spill_write_revive*.rs` 管「写入/清除阻塞物」触发的复活。本文件只管排序这
//! 一条搬迁路径。

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, Sheet, SortDirection, SortKey};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).expect("test address must parse")
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

/// `B1 = SEQUENCE(3)` 想要 B1:B3，被 B2 的字面量挡住 —— anchor 停在碰撞态：
/// 三张已安装索引全空，登记表里一条 anchor、两条 claim（B2、B3）。
fn blocked_at_b1() -> Sheet {
    let mut sheet = Sheet::new();
    sheet.set_cell("B2", Value::Number(5.0));
    assert!(sheet.set_formula("B1", "=SEQUENCE(3)"));
    assert_eq!(
        sheet.get_cell("B1"),
        Value::Error(ValueError::Spill),
        "前置：被挡住的 anchor 读 #SPILL!"
    );
    assert_eq!(
        sheet.debug_spill_anchor_count(),
        0,
        "前置：什么都没装，spill_targets 里没有它"
    );
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "前置：碰撞态 anchor 登记在 blocked 表里"
    );
    sheet
}

/// 三张已安装索引必须始终互相对齐（A-8 不变式），且碰撞态 anchor 永不混进去。
fn assert_spill_indexes_consistent(sheet: &Sheet) {
    assert_eq!(
        sheet.debug_spill_reverse_index_len(),
        sheet.debug_spill_target_count(),
        "反向索引必须与已安装的 target 列表等长"
    );
    assert_eq!(
        sheet.debug_spill_anchor_index_len(),
        sheet.debug_spill_anchor_count(),
        "anchor 地址索引必须与已安装的 anchor 表等长"
    );
}

// =====================================================================
// 搬动 anchor 本身
// =====================================================================

/// 本文件存在的理由。排序把碰撞态 anchor 从 B1 换到 B2：新盒子 B2:B4 是空的，
/// 数组本该立刻溢出。修复前它永远停在 `#SPILL!`，B3/B4 一直空。
#[test]
fn sort_moving_a_blocked_anchor_into_a_free_box_respills() {
    let mut sheet = blocked_at_b1();

    // 升序：数字排在错误值之前，于是 B1 拿到 5、B2 拿到公式。
    let report = sheet
        .sort_range(range("B1", "B2"), &[asc(1)], &[])
        .expect("碰撞态 anchor 不设闸门，排序必须放行");
    assert_eq!(report.moved_rows, 2, "两行都换了位置");

    assert_eq!(sheet.get_cell("B1"), Value::Number(5.0), "阻塞物搬到了 B1");
    match sheet.get_cell("B2") {
        Value::Array(arr) => assert_eq!(arr.shape(), (3, 1), "B2 应当就地溢出成 3x1"),
        other => panic!("B2 拿着 =SEQUENCE(3)，B2:B4 全空，必须溢出，实得 {other:?}"),
    }
    assert_eq!(sheet.get_cell("B3"), Value::Number(2.0), "投影格已安装");
    assert_eq!(sheet.get_cell("B4"), Value::Number(3.0), "投影格已安装");
    assert_eq!(sheet.spill_info(addr("B2")), Some((3, 1)));
    assert_eq!(sheet.spill_anchor_for(addr("B3")), Some(addr("B2")));

    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        0,
        "溢出成功后登记表必须清空"
    );
    assert_eq!(sheet.debug_spill_blocked_claim_count(), 0);
    assert_eq!(sheet.debug_spill_anchor_count(), 1);
    assert_eq!(sheet.debug_spill_target_count(), 2);
    assert_spill_indexes_consistent(&sheet);
}

/// 搬完仍然碰撞时，登记表必须按**新**地址重键 —— 否则新地址上的数组再也不会
/// 因为阻塞物被清掉而复活。
///
/// 布局：`B1 = SEQUENCE(1,3)` 横向要 B1:D1，被 D1 挡住；D2 上另有一个字面量，
/// 所以公式搬到 B2 之后要的 B2:D2 仍然被 D2 挡住。排序只动 B 列。
#[test]
fn sort_rekeys_the_blocked_registry_to_the_new_anchor_address() {
    let mut sheet = Sheet::new();
    sheet.set_cell("D1", Value::Number(999.0));
    sheet.set_cell("D2", Value::Number(888.0));
    sheet.set_cell("B2", Value::Number(5.0));
    assert!(sheet.set_formula("B1", "=SEQUENCE(1,3)"));
    assert_eq!(sheet.get_cell("B1"), Value::Error(ValueError::Spill));
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1);

    sheet
        .sort_range(range("B1", "B2"), &[asc(1)], &[])
        .expect("排序放行");

    assert_eq!(sheet.get_cell("B1"), Value::Number(5.0));
    assert_eq!(
        sheet.get_cell("B2"),
        Value::Error(ValueError::Spill),
        "新盒子 B2:D2 仍被 D2 挡住，anchor 继续 #SPILL!"
    );
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "仍然恰好一条 —— 重键，不是又登一条"
    );

    // 关键判据：清掉**新**盒子的阻塞物必须复活。登记表若还键在 B1，
    // 清 D2 时没有任何 claim 指向 B2，数组就永远回不来。
    sheet.clear_cell("D2");
    match sheet.get_cell("B2") {
        Value::Array(arr) => assert_eq!(arr.shape(), (1, 3)),
        other => panic!("清掉 D2 后 B2 必须复活，实得 {other:?}"),
    }
    assert_eq!(sheet.get_cell("C2"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("D2"), Value::Number(3.0));
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
    assert_spill_indexes_consistent(&sheet);
}

/// 登记表键错的第二个后果：写**旧** anchor 地址会退掉现在住在新地址的那个
/// anchor 的 claim。B1 排序后只是一个普通字面量，与该数组再无关系，碰它却让
/// 登记表凭空少一条 —— 之后连结构编辑都救不回来了。
#[test]
fn writing_the_vacated_address_must_not_retire_the_moved_anchors_claim() {
    let mut sheet = Sheet::new();
    sheet.set_cell("D1", Value::Number(999.0));
    sheet.set_cell("D2", Value::Number(888.0));
    sheet.set_cell("B2", Value::Number(5.0));
    assert!(sheet.set_formula("B1", "=SEQUENCE(1,3)"));
    assert_eq!(sheet.get_cell("B1"), Value::Error(ValueError::Spill));

    sheet
        .sort_range(range("B1", "B2"), &[asc(1)], &[])
        .expect("排序放行");
    assert_eq!(sheet.get_cell("B2"), Value::Error(ValueError::Spill));

    // 写旧 anchor 地址。B1 现在是个与数组无关的字面量。
    sheet.set_cell("B1", Value::Number(42.0));
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "B1 与该数组无关，写它不该退掉 B2 的 claim"
    );

    // 若上面那条 claim 被误退，这里就再也复活不了。
    sheet.clear_cell("D2");
    match sheet.get_cell("B2") {
        Value::Array(arr) => assert_eq!(arr.shape(), (1, 3)),
        other => panic!("claim 被误退：清掉真正的阻塞物后 B2 仍然 {other:?}"),
    }
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
    assert_spill_indexes_consistent(&sheet);
}

// =====================================================================
// anchor 不动，排序挪走了它盒子里的阻塞物
// =====================================================================

/// 排序也能在**不碰 anchor** 的情况下腾空它的盒子，所以重投影集合必须覆盖整张
/// 登记表，而不只是落在排序矩形里的 anchor。
///
/// 布局：`A2 = SEQUENCE(1,3)` 要 A2:C2，被 C2 挡住。排序 C1:C2 —— 空格永远沉底，
/// 于是 999 升到 C1、C2 变空，而 anchor A2 完全在排序矩形之外。
#[test]
fn sort_outside_the_box_that_frees_it_revives_the_blocked_anchor() {
    let mut sheet = Sheet::new();
    sheet.set_cell("C2", Value::Number(999.0));
    assert!(sheet.set_formula("A2", "=SEQUENCE(1,3)"));
    assert_eq!(sheet.get_cell("A2"), Value::Error(ValueError::Spill));
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 1);

    sheet
        .sort_range(range("C1", "C2"), &[asc(2)], &[])
        .expect("排序放行");
    assert_eq!(sheet.get_cell("C1"), Value::Number(999.0), "非空升到 C1");

    match sheet.get_cell("A2") {
        Value::Array(arr) => assert_eq!(arr.shape(), (1, 3), "盒子腾空，数组必须复活"),
        other => panic!("C2 已空，A2 必须复活，实得 {other:?}"),
    }
    assert_eq!(sheet.get_cell("B2"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("C2"), Value::Number(3.0));
    assert_eq!(sheet.debug_spill_blocked_anchor_count(), 0);
    assert_spill_indexes_consistent(&sheet);
}

// =====================================================================
// 反向对照：排序不该把没被腾空的盒子也"复活"
// =====================================================================

/// 排序把阻塞物在盒子**内部**换了个位置：anchor 必须**保持** `#SPILL!`，
/// 且一个投影格都不许装。没有这条对照，上面几条在"无脑重投影"的假修法下
/// 也会绿。
#[test]
fn sort_that_only_shuffles_inside_the_box_keeps_the_anchor_blocked() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A3", Value::Number(999.0));
    sheet.set_cell("A4", Value::Number(111.0));
    assert!(sheet.set_formula("A1", "=SEQUENCE(6)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));

    // A3=999、A4=111 升序对调，两者都还在 A1:A6 里面。
    sheet
        .sort_range(range("A3", "A4"), &[asc(0)], &[])
        .expect("排序放行");

    assert_eq!(sheet.get_cell("A3"), Value::Number(111.0));
    assert_eq!(sheet.get_cell("A4"), Value::Number(999.0));
    assert_eq!(
        sheet.get_cell("A1"),
        Value::Error(ValueError::Spill),
        "阻塞物还在盒子里 —— anchor 必须继续 #SPILL!"
    );
    for cell in ["A2", "A5", "A6"] {
        assert_eq!(
            sheet.get_cell(cell),
            Value::Null,
            "{cell} 必须为空 —— 碰撞态 anchor 一个投影格都不装"
        );
    }
    assert_eq!(sheet.debug_spill_anchor_count(), 0);
    assert_eq!(
        sheet.debug_spill_blocked_anchor_count(),
        1,
        "仍然恰好一条 —— 重新登记，不是累加"
    );
    assert_spill_indexes_consistent(&sheet);
}
