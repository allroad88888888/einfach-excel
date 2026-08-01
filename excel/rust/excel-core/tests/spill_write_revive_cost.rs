//! ADR 0006 「后果」一节点名的那个代价，用计数器钉住。
//!
//! Excel 语义把「销毁整片派生 atom」从「清 anchor / 改形状 / 结构编辑」挪到了
//! **普通按键路径**上：`=SEQUENCE(100000)` 的溢出区里打一个字，要销毁 99999 个
//! 派生 atom。ADR 明写这需要新增 atom-count 回归 —— 就是本文件。
//!
//! 断的是**回到基线**而不是耗时（本仓纪律：counters, not clocks）：塌缩再复活
//! 之后 atom 数必须与从未塌缩过一样，否则就是每次按键泄漏一片。

use einfach_core::{Value, ValueError};
use einfach_excel_core::Sheet;

mod spill_write_support;

// =====================================================================
// Cost — the ADR's "this moves onto the keystroke path" concern
// =====================================================================

/// Withdrawing a 10k-cell spill used to be reachable only by clearing the
/// anchor or editing structure. ADR 0006 puts it on "type a character into
/// the spill region", so the leak probe `scale_suite.rs`'s `s5` runs for
/// structural edits has to run for this path too: the collapse must destroy
/// exactly the atoms it created, and the revive must restore the baseline.
#[test]
fn atom_count_returns_to_baseline_across_a_10k_collapse_and_revive() {
    const N: u32 = 10_000;
    let mut sheet = Sheet::new();
    let empty_atoms = sheet.debug_total_atom_count();

    assert!(sheet.set_formula("A1", &format!("=SEQUENCE({N})")));
    assert_eq!(sheet.debug_spill_target_count(), (N - 1) as usize);
    let spilled_atoms = sheet.debug_total_atom_count();

    // One keystroke in the middle of the region.
    sheet
        .try_set_cell(&format!("A{}", N / 2), Value::Number(1.0))
        .expect("write accepted");
    assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
    let collapsed_atoms = sheet.debug_total_atom_count();
    assert_eq!(sheet.debug_spill_target_count(), 0);
    assert_eq!(sheet.debug_spill_reverse_index_len(), 0);
    // The collapse must actually reclaim the projection atoms, not strand
    // them: what is left is the empty-sheet baseline plus the anchor, the
    // written cell, and their facade/epoch scaffolding — bounded by a small
    // constant, NOT by N.
    assert!(
        collapsed_atoms < empty_atoms + 64,
        "collapse leaked: {collapsed_atoms} atoms vs {empty_atoms} on an empty sheet"
    );

    // 10k > SPILL_BLOCKED_CLAIM_RECT_LIMIT, so this anchor is in the degraded
    // tier and clearing the obstruction does not auto-revive it. Re-installing
    // the formula is the explicit re-trigger; the atom count must come back to
    // the pre-collapse figure plus at most the fixed scaffolding the two
    // addresses this test READ have materialised since — a constant, never
    // anything that scales with N.
    sheet.clear_cell(&format!("A{}", N / 2));
    assert!(sheet.set_formula("A1", &format!("=SEQUENCE({N})")));
    assert_eq!(sheet.debug_spill_target_count(), (N - 1) as usize);
    let respilled_atoms = sheet.debug_total_atom_count();
    assert!(
        respilled_atoms >= spilled_atoms && respilled_atoms - spilled_atoms <= 16,
        "re-spill must return to the pre-collapse count (+ read scaffolding): \
         {respilled_atoms} vs {spilled_atoms}"
    );
}

/// The same round trip just UNDER the claim cap, so the revive half runs
/// through the stage 2 path rather than an explicit re-trigger. Together with
/// the 10k probe above this covers both tiers.
#[test]
fn atom_count_returns_to_baseline_across_a_capped_collapse_and_revive() {
    const N: u32 = 4_000;
    let mut sheet = Sheet::new();
    assert!(sheet.set_formula("A1", &format!("=SEQUENCE({N})")));

    let cycle = |sheet: &mut Sheet| {
        sheet.try_set_cell("A1000", Value::Number(1.0)).unwrap();
        assert_eq!(sheet.get_cell("A1"), Value::Error(ValueError::Spill));
        assert_eq!(sheet.debug_spill_target_count(), 0, "projection reclaimed");
        assert_eq!(sheet.debug_spill_blocked_claim_count(), (N - 1) as usize);

        sheet.clear_cell("A1000");
        assert_eq!(sheet.debug_spill_target_count(), (N - 1) as usize);
        assert_eq!(sheet.debug_spill_blocked_claim_count(), 0);
    };

    // First cycle settles the read scaffolding for the addresses involved;
    // every cycle after it must be exactly atom-count neutral, which is the
    // property that matters when this path is a keystroke.
    cycle(&mut sheet);
    let settled_atoms = sheet.debug_total_atom_count();
    for _ in 0..3 {
        cycle(&mut sheet);
        assert_eq!(
            sheet.debug_total_atom_count(),
            settled_atoms,
            "a {N}-cell collapse/auto-revive cycle must be atom-count neutral"
        );
    }
}
