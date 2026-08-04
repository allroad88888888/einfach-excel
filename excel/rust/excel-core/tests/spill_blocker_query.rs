//! `Sheet::spill_blocker` —— 「这个 `#SPILL!` 是被哪一格挡住的」。
//!
//! 与三个 `spill_write_revive*.rs` 分开：那几个问「该不该复活、复活得对不对」，
//! 这里问「引擎说不说得出**理由**」。理由是纯诊断，不参与任何重算决策，所以断言
//! 全部是「问一句、答一句」，没有一条依赖复活流程跑过。
//!
//! 每条钉住一个能让这个查询变成**误导**的失效模式 —— 答错比不答更糟，因为用户会
//! 照着去清一个清了也没用的格子。

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, Sheet};

fn at(addr: &str) -> CellAddress {
    CellAddress::parse(addr).expect("valid address")
}

/// 基本形：H3 挡住 `=SEQUENCE(10)`，引擎必须指得出 H3。
#[test]
fn reports_the_cell_that_blocks_the_array() {
    let mut sheet = Sheet::new();
    sheet.set_cell("H3", Value::Number(999.0));
    assert!(sheet.set_formula("H1", "=SEQUENCE(10)"));
    assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));

    assert_eq!(sheet.spill_blocker(at("H1")), Some(at("H3")));
}

/// 行主序**第一个** —— 与 `register_spill` 的碰撞扫描同序。
///
/// 这条是整个查询有没有用的关键：若报的是 D2 而不是 B2，用户清掉 D2 之后数组
/// 仍然不复活（B2 还挡着），提示就成了误导。2×3 的矩形里同时放两个阻塞物，只有
/// 行主序才会先撞上 B2。
#[test]
fn reports_the_row_major_first_obstruction_not_an_arbitrary_one() {
    let mut sheet = Sheet::new();
    // A1 起的 2×3 矩形 = A1:C2。B2、C1 都挡着；行主序先到 C1（row 0）。
    sheet.set_cell("C1", Value::Number(1.0));
    sheet.set_cell("B2", Value::Number(2.0));
    assert!(sheet.set_formula("A1", "={1,2,3;4,5,6}"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));

    assert_eq!(
        sheet.spill_blocker(at("A1")),
        Some(at("C1")),
        "必须是行主序第一个，否则清掉它数组也不复活"
    );
}

/// 不是碰撞态锚点的地址一律 `None`：正常溢出的锚点、投影格、普通格、空格。
///
/// 尤其是**正常溢出的锚点** —— 它有形状、有矩形，最容易被实现成「扫一遍矩形，
/// 报第一个非空格」，那会把自己的投影格报成阻塞物。
#[test]
fn healthy_cells_have_no_blocker() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(7.0));
    assert!(sheet.set_formula("H1", "=SEQUENCE(3)"));
    assert!(matches!(sheet.get_cell("H1"), Value::Array(_)));

    assert_eq!(sheet.spill_blocker(at("H1")), None, "活着的锚点没有阻塞物");
    assert_eq!(sheet.spill_blocker(at("H2")), None, "投影格不是锚点");
    assert_eq!(sheet.spill_blocker(at("A1")), None, "普通字面量格");
    assert_eq!(sheet.spill_blocker(at("Z50")), None, "空格");
}

/// 清掉阻塞物之后，答案必须跟着消失 —— 它是现算的，不是碰撞时烙下来的快照。
#[test]
fn the_answer_disappears_with_the_obstruction() {
    let mut sheet = Sheet::new();
    sheet.set_cell("H3", Value::Number(999.0));
    assert!(sheet.set_formula("H1", "=SEQUENCE(10)"));
    assert_eq!(sheet.spill_blocker(at("H1")), Some(at("H3")));

    sheet.clear_cell("H3");
    assert!(matches!(sheet.get_cell("H1"), Value::Array(_)), "数组复活");
    assert_eq!(sheet.spill_blocker(at("H1")), None);
}

/// 换一个阻塞物：答案跟着换。
///
/// 这条区分「现算」与「碰撞时记一次」两种实现：后者在**没有重跑重算**的路径上会
/// 继续指着已经清空的老格子。
#[test]
fn the_answer_follows_the_current_obstruction() {
    let mut sheet = Sheet::new();
    sheet.set_cell("H5", Value::Number(1.0));
    assert!(sheet.set_formula("H1", "=SEQUENCE(10)"));
    assert_eq!(sheet.spill_blocker(at("H1")), Some(at("H5")));

    // 在更靠上的位置再放一个：行主序第一个变成 H2。
    sheet.set_cell("H2", Value::Number(2.0));
    assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));
    assert_eq!(sheet.spill_blocker(at("H1")), Some(at("H2")));
}

/// 超出 claims 上限（4096 格）的矩形照样答得出。
///
/// `BlockedClaims::register` 先记 anchor 再测上限，逐格 claims 才受限 —— 本查询
/// 只要 anchor 那条形状记录，所以「大数组不自动复活」不该连累「大数组说得出理由」。
/// 这正是最需要提示的场景：数组越大，用户越猜不出是哪一格挡的。
#[test]
fn oversized_rectangle_still_reports_its_blocker() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A3", Value::Number(99.0));
    assert!(sheet.set_formula("A1", "=SEQUENCE(5000)"));
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    assert_eq!(
        sheet.debug_spill_blocked_claim_count(),
        0,
        "前提：这个矩形超过 claims 上限，一个 claim 都没登记"
    );

    assert_eq!(sheet.spill_blocker(at("A1")), Some(at("A3")));
}

/// 撞表边而不是撞格子时回 `None` —— 没有哪一格该被指责，编一个出来才是错的。
#[test]
fn out_of_bounds_collision_blames_no_cell() {
    let mut sheet = Sheet::new();
    // 1048576 行的表，从 A1048570 起要 10 行 —— 装不下。
    assert!(sheet.set_formula("A1048570", "=SEQUENCE(10)"));
    assert_eq!(sheet.get_cell("A1048570"), Value::Error(ValueError::Spill));

    assert_eq!(sheet.spill_blocker(at("A1048570")), None);
}

/// 公式格与字面量一样算阻塞物：`is_target_occupied` 是同一个判定，不能只认字面量。
#[test]
fn a_formula_cell_counts_as_the_blocker() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(2.0));
    assert!(sheet.set_formula("H4", "=A1*3"));
    assert!(sheet.set_formula("H1", "=SEQUENCE(10)"));
    assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));

    assert_eq!(sheet.spill_blocker(at("H1")), Some(at("H4")));
}

/// 阻塞物是别的数组的**锚点**时，报的就是那一格 —— 它本来就是用户要清的那一格，
/// 不需要任何反查。
///
/// 顺带钉住「只追一步」前提的第二个方向：矩形盖住一个活锚点时，那个锚点**不会**被
/// 装成投影格（`is_target_occupied` 判公式格占用），所以 H3 追一步是空转。
#[test]
fn another_arrays_anchor_is_reported_as_itself() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("H3", "=SEQUENCE(3)"));
    assert!(matches!(sheet.get_cell("H3"), Value::Array(_)));
    assert!(sheet.set_formula("H1", "=SEQUENCE(10)"));
    assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));

    assert_eq!(sheet.spill_blocker(at("H1")), Some(at("H3")));
    assert_eq!(
        sheet.spill_anchor_for(at("H3")),
        None,
        "活锚点不会同时是别人的投影格 —— 追一步落在这里就该停"
    );
}

/// 「一个地址不可能既是锚点又是投影格」—— `blame_for` 只追一步、不防环的那条前提，
/// 从最危险的方向验一次：**把一个投影格变成锚点**。
///
/// ADR 0006 的写入语义要求先 `collapse_spill_for_write` 拆掉原数组，那一格的
/// `spill_target_anchor` 条目当场消失，之后它才成为新锚点。两个身份不重叠，所以追
/// 一步落到的锚点再追第二步永远是空转 —— 也就没有链、没有环可防。
#[test]
fn an_anchor_address_is_never_also_a_projection_cell() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("C1", "=SEQUENCE(3)"));
    assert_eq!(sheet.spill_anchor_for(at("C2")), Some(at("C1")), "C2 先是投影格");

    assert!(sheet.set_formula("C2", "=SEQUENCE(2)"));
    assert!(matches!(sheet.get_cell("C2"), Value::Array(_)), "C2 现在是锚点");
    assert_eq!(
        sheet.spill_anchor_for(at("C2")),
        None,
        "成为锚点的同时不再是投影格，两个身份互斥"
    );
}

/// 阻塞物是别的数组的**投影格**时，报的必须是那个数组的**锚点**，不是投影格本身。
///
/// 布局：C1 的 3×1 数组占 C1:C3（C2、C3 是投影格）；A2 的 1×4 数组想占 A2:D2，
/// 行主序第一个撞上的是 **C2** —— 一个用户没打过任何东西的格子。
///
/// 报 C2 是**误导**：按 ADR 0006，往投影格里写/清会把 C1 的数组整个塌成 `#SPILL!`，
/// 用户拿一个 `#SPILL!` 换另一个。真正的解法只有「把 C1 的公式清掉」，所以引擎必须
/// 说 C1。
#[test]
fn a_projection_cell_blocker_is_reported_as_its_anchor() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("C1", "=SEQUENCE(3)"));
    assert!(matches!(sheet.get_cell("C1"), Value::Array(_)));
    assert!(sheet.set_formula("A2", "={1,2,3,4}"));
    assert_eq!(sheet.get_cell("A2"), Value::Error(ValueError::Spill));
    assert_eq!(
        sheet.spill_anchor_for(at("C2")),
        Some(at("C1")),
        "前提：撞上的那一格确实是 C1 的投影格，不是用户自己打的值"
    );

    assert_eq!(
        sheet.spill_blocker(at("A2")),
        Some(at("C1")),
        "要报的是数组的锚点 —— 清投影格只会把那个数组也打成 #SPILL!"
    );
}

/// 结构编辑之后答案跟着移动 —— 阻塞物被推走则无人可指，仍留在矩形里则指新地址。
#[test]
fn structural_edit_moves_the_answer_with_the_cells() {
    let mut sheet = Sheet::new();
    sheet.set_cell("H3", Value::Number(999.0));
    assert!(sheet.set_formula("H1", "=SEQUENCE(4)"));
    assert_eq!(sheet.spill_blocker(at("H1")), Some(at("H3")));

    // 在 H3 之前插一行：阻塞物变 H4，anchor 还在 H1，矩形 H1:H4 仍盖着它。
    sheet.insert_row(1, 1);
    assert_eq!(sheet.get_cell("H1"), Value::Error(ValueError::Spill));
    assert_eq!(sheet.spill_blocker(at("H1")), Some(at("H4")));
}
