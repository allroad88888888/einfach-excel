//! 批量装载路径上的惰性安装与订阅通知。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

#[test]
fn set_formula_replaces_lazy_record_without_store_growth() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(10.0));
    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.get_cell("B1"), Value::Number(20.0));
    let atoms_after_first = sheet.debug_total_atom_count();

    sheet.set_formula("B1", "=A1*3");
    assert_eq!(sheet.get_cell("B1"), Value::Number(30.0));
    assert_eq!(
        sheet.debug_total_atom_count(),
        atoms_after_first,
        "formula replacement must not create core atoms"
    );

    for n in 1..=20 {
        sheet.set_formula("B1", &format!("=A1+{}", n));
    }
    assert_eq!(sheet.get_cell("B1"), Value::Number(30.0));
    assert_eq!(sheet.debug_formula_count(), 1);
    assert_eq!(sheet.debug_total_atom_count(), atoms_after_first);
}

// === LAZY_FORMULA_EVAL Step 3 — bulk_load tests ===

#[test]
fn bulk_load_set_formula_zero_eval_count() {
    // 100 formulas through bulk_load must not trigger a single core
    // recompute. With lazy formulas the only way recompute_count can
    // increment is if a code path calls Store::recompute on a derived
    // atom, which the lazy path never does. The acceptance bar is "0",
    // not "small N".
    let mut sheet = Sheet::new();
    // Seed A1 so the formulas have something to reference; primitive
    // store.set does not bump recompute_count.
    sheet.set_cell("A1", Value::Number(1.0));
    let before = sheet.debug_recompute_count();

    sheet.bulk_load(|loader| {
        for n in 0..100u32 {
            // Row 0 col (n+1) avoids overwriting A1.
            let addr = CellAddress::new(0, n + 1).to_string_repr();
            let ok = loader.set_formula(&addr, "=A1+1");
            assert!(ok, "formula {} must parse + pass cycle check", addr);
        }
    });

    let after = sheet.debug_recompute_count();
    assert_eq!(
        after - before,
        0,
        "bulk_load with set_formula only must not trigger any core recompute"
    );
    assert_eq!(sheet.debug_formula_count(), 100);
    // Compatibility cache probes stay Dirty until a formula is materialized.
    assert_eq!(
        sheet.debug_formula_cache_state("B1"),
        "dirty",
        "first bulk-loaded formula must remain dirty until read"
    );
}

#[test]
fn bulk_load_notifies_subscribers_once() {
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    // Five subscribed addresses. Each gets its own counter so a missing
    // fire on one is visible.
    let counters: Vec<Rc<RefCell<u32>>> = (0..5).map(|_| Rc::new(RefCell::new(0u32))).collect();
    let addrs = ["A1", "B1", "C1", "D1", "E1"];
    for (i, addr) in addrs.iter().enumerate() {
        let c = counters[i].clone();
        sheet.subscribe_cell(addr, move || *c.borrow_mut() += 1);
    }

    // Bulk-load: write to all five subscribed addresses, plus some
    // unrelated ones, plus formulas whose downstream touches the
    // subscribed cells. Each subscribed address must fire exactly once.
    sheet.bulk_load(|loader| {
        for addr in &addrs {
            loader.set_cell(addr, Value::Number(1.0));
        }
        // Unrelated writes — should not bump any subscribed counter.
        loader.set_cell("Z10", Value::Number(42.0));
        loader.set_cell("Z11", Value::Number(43.0));
        // Formulas referencing A1 multiple times — without dedup A1's
        // listener could fire once per dirty downstream BFS pass.
        loader.set_formula("F1", "=A1+A1");
        loader.set_formula("F2", "=A1*2");
        loader.set_formula("F3", "=A1-1");
    });

    for (i, addr) in addrs.iter().enumerate() {
        assert_eq!(
            *counters[i].borrow(),
            1,
            "subscriber on {} must fire exactly once across the bulk_load",
            addr
        );
    }
}

#[test]
fn bulk_load_skips_eval_until_first_read() {
    let mut sheet = Sheet::new();
    sheet.bulk_load(|loader| {
        loader.set_cell("A1", Value::Number(5.0));
        loader.set_formula("B1", "=A1*2");
    });

    // Pre-read: B1 is still parked and the compatibility probe reports
    // Dirty. No formula-inner exists until the first read.
    assert_eq!(
        sheet.debug_formula_cache_state("B1"),
        "dirty",
        "bulk-loaded formula must stay dirty until first read"
    );

    // First read computes and caches.
    assert_eq!(sheet.get_cell("B1"), Value::Number(10.0));
    assert_eq!(
        sheet.debug_formula_cache_state("B1"),
        "clean",
        "first get_cell on a bulk-loaded formula must compute and cache"
    );
}

#[test]
fn bulk_load_unsubscribed_addresses_not_notified() {
    // Lazy-extreme contract: only currently-subscribed addresses get
    // notified at flush. We verify by writing to a subscribed A1 and an
    // unsubscribed Z99, then confirming (a) A1's subscriber fires
    // exactly once and (b) the only recompute is the subscribed A1 facade,
    // not the unsubscribed Z99 write.
    use std::cell::RefCell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    let count = Rc::new(RefCell::new(0u32));
    let cc = count.clone();
    let _sub = sheet.subscribe_cell("A1", move || *cc.borrow_mut() += 1);

    let before = sheet.debug_recompute_count();
    sheet.bulk_load(|loader| {
        loader.set_cell("A1", Value::Number(7.0));
        loader.set_cell("Z99", Value::Number(99.0));
    });
    let after = sheet.debug_recompute_count();

    assert_eq!(
        *count.borrow(),
        1,
        "subscribed A1 must fire exactly once at flush"
    );
    assert_eq!(
        after - before,
        1,
        "only the subscribed A1 facade should recompute at flush"
    );
    // And reading the subscribed cell still gets the bulk value.
    assert_eq!(sheet.get_cell("A1"), Value::Number(7.0));
    assert_eq!(sheet.get_cell("Z99"), Value::Number(99.0));
}

/// Stripe pattern with many overlapping Tier-A ranges. It verifies that
/// bulk-loaded formulas materialize member-facade dependencies and Store
/// re-derives exactly the windows affected by a later source write.
///
/// 200 stripes (B_i = SUM(A_i:A_{i+9})) over 200 A-column seeds.
/// Bulk-load the whole sheet in one shot, then flip one A cell and
/// re-read the downstream B values. Every B whose window contains
/// the mutated cell must re-evaluate to the new value, exactly
/// matching the formulas' Store-recorded dependencies.
#[test]
fn bulk_load_stripe_ranges_recompute_through_store() {
    let mut sheet = Sheet::new();
    const N: u32 = 200;
    const WINDOW: u32 = 10;
    sheet.bulk_load(|loader| {
        for row in 0..N {
            loader.set_cell(&format!("A{}", row + 1), Value::Number(1.0));
        }
        for i in 0..N {
            let lo = i + 1;
            let hi = (i + WINDOW).min(N);
            let formula = format!("=SUM(A{}:A{})", lo, hi);
            loader.set_formula(&format!("B{}", i + 1), &formula);
        }
    });

    // Each B_i sums its window of 10 cells (or fewer at the tail),
    // so the initial result is `min(WINDOW, N - i)`.
    for i in 0..N {
        let expected = (WINDOW.min(N - i)) as f64;
        assert_eq!(
            sheet.get_cell(&format!("B{}", i + 1)),
            Value::Number(expected),
            "initial sum for stripe row {}",
            i
        );
    }

    // Mutate one mid-window A cell and verify every stripe whose
    // window contains it re-evaluates.
    let mutated_row: u32 = 50;
    sheet.set_cell(&format!("A{}", mutated_row + 1), Value::Number(11.0));
    for i in 0..N {
        let lo = i;
        let hi = (i + WINDOW - 1).min(N - 1);
        // Window covers row indices [lo, hi]. A_{mutated_row+1} is
        // at row index `mutated_row`.
        let in_window = mutated_row >= lo && mutated_row <= hi;
        let base = (hi - lo + 1) as f64; // sum of the other 1's
        let expected = if in_window { base + 10.0 } else { base };
        assert_eq!(
            sheet.get_cell(&format!("B{}", i + 1)),
            Value::Number(expected),
            "post-mutate sum for stripe row {} (in_window={})",
            i,
            in_window
        );
    }
}
