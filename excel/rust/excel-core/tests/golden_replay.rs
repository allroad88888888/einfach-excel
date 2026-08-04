//! Golden replay fixtures — the drift oracle for the atom-delegation rewrite.
//!
//! P0 of `excel/rust/docs/ATOM_DELEGATION_REWRITE_PLAN.md`: seeded op sequences ran
//! against the pre-rewrite engine once (`cargo test --test golden_replay
//! golden_generate -- --ignored`) and their observable end states were
//! committed under `tests/fixtures/`. The always-on replay tests re-run the
//! exact same op sequences against the current engine and diff the snapshot.
//!
//! The snapshot records VALUES ONLY (displays, formula texts, spill anchors)
//! — no counters, no timing. P7 approved a line-by-line fixture correction for
//! colliding `SEQUENCE` anchors and their downstream formulas: the public Sheet
//! facade returns `#SPILL!`, while the removed force-recompute bypass had
//! exposed raw arrays. The migration used the opt-in all-diff report and did
//! not regenerate fixtures.
//!
//! A second approved line-by-line correction covers the arithmetic type-
//! coercion error code: `=1+"x"` now yields `#VALUE!` (Excel's answer) instead
//! of the engine-private `#TYPE!`, so 7 fixture lines whose formula is an
//! arithmetic expression moved `E:#TYPE!` -> `E:#VALUE!` (seed 11 line 59,
//! seed 37 lines 375/404/524/595, seed 41 lines 379/795). The `#TYPE!` lines
//! that come from built-in argument-type rejection were left untouched, which
//! is why this was a targeted edit and not a regeneration.
//!
//! The follow-up that made `WrongType` RENDER as `#VALUE!` at every display
//! boundary (`format::error_display_token`) needed NO fixture change, and the
//! 6 surviving `E:#TYPE!` lines (seed 37 lines 21/87/185/877, seed 53 lines
//! 225/591) are correct as written. `render` below serializes
//! `Value::Error(e)` through `Display`, i.e. it records the internal DIAGNOSTIC
//! variant, not the token a user would see — which is exactly what a drift
//! oracle wants, since a variant change is a real behavior change while a
//! rendering change is not. Those cells display `#VALUE!` today; do not
//! "correct" the fixtures to match the screen.
//!
//! The same applies to the later `WrongArgCount` -> `#VALUE!` collapse: no
//! fixture line moved (`E:#ARGS!` has zero occurrences across all five seeds
//! — the seeded workloads never emit a wrong-arity call), and if one ever
//! appears it must stay `E:#ARGS!` for the same reason.
//!
//! A third approved line-by-line correction covers ADR 0006 stage 0: a spill
//! anchor that collided (`register_spill` -> `Err`) left no entry in any spill
//! bookkeeping map, so `teardown_all_spills` could not see it and structural
//! edits never retried it — while the `Error(Spill)` primitive in `cells[addr]`
//! survived `relocate_cells` verbatim. An anchor whose obstruction was shifted
//! out of its bounding box therefore stayed `#SPILL!` forever. Structural edits
//! now retry collided anchors too, which moves 47 fixture lines across 4 seeds
//! (seed 11 is untouched):
//!
//!   * 11 anchors `E:#SPILL!` -> `A:RxC[..]` (seed 23 H10/M12/N4, seed 37
//!     G4/J25/K33/D22/K5, seed 41 H3/L5, seed 53 F16). Each was blocked at some
//!     point and unblocked by a later insert/delete that the engine ignored.
//!   * 27 inserted target lines. Those 11 anchors own 31 projection cells in
//!     total (9 x `SEQUENCE(2,2)` x 3 targets + 2 x `SEQUENCE(3,1)` x 2); the
//!     other 4 already had a fixture line and are the replacements below.
//!   * 4 lines where a target cell had been re-used after the box was freed and
//!     is now shadowed by the projection (seed 23 I11 `=COUNT(A1:F20)`/25 -> 4
//!     and M13 49 -> 3, seed 37 K26 461 -> 4, seed 41 L6 360 -> 3). Writes into
//!     a live spill target are silently rejected today, so those ops no longer
//!     land — that rejection is exactly what ADR 0006 stage 1 will replace.
//!   * 2 lines where `=SUM(D1:H9)` had been aggregating over the stuck
//!     `#SPILL!` cell H3 and propagated the error; with H3 spilling the sums
//!     evaluate (seed 41 Q1/S12 -> 2592).
//!   * 3 deleted literals (seed 37 Sheet1 L7/L8, Beta N10) — second-order
//!     drift, not a lost write: the first divergence in each seed is a single
//!     structural edit unblocking one anchor (seed 23 op 1064 `insert_col at=4`,
//!     seed 37 op 227 `insert_col at=3`, seed 41 op 1435 `delete_row at=12
//!     count=2`, seed 53 op 1002 `insert_col at=1`), and the remaining ~800
//!     ops — 10% of them structural — redistribute that difference. Sheet1 L7/L8
//!     are emptied by op 1968's `delete_col at=4`, which pulls the (now empty)
//!     column M into L.
//!
//! Retrying collided anchors also made this oracle catch a latent
//! nondeterminism: the post-shift re-derive order came straight from
//! `spill_targets.keys()`, a `HashMap` whose hasher is seeded per process. It
//! never mattered while only installed anchors re-derived, but a retried anchor
//! can contend for a rectangle, and seed 53's `=SEQUENCE(3,1,N23)` flipped
//! between starting at 0 and at 273 across runs (measured 4/4 both ways). Both
//! re-derive lists are now sorted row-major, which is also the tie-break
//! `sort.rs` §5.1 already uses. Do not "simplify" that sort away.
//!
//! The migration diffed the engine snapshot against the fixtures, applied each
//! line as an assert-the-original-then-replace edit, and re-checked the result
//! byte-for-byte; fixtures were NOT regenerated. Post-fix the end states satisfy
//! the invariant that motivated the fix: a `SEQUENCE` anchor reads `#SPILL!`
//! only when its bounding box is genuinely occupied (7 violations before, 0
//! after), and every spilled anchor owns its full rectangle.
//!
//! A fourth approved line-by-line correction covers ADR 0006 stages 1+2 —
//! Excel's write semantics for the spill region. A write aimed at a non-anchor
//! projection cell used to be silently dropped (`BulkLoader`) or refused
//! (`SheetError::SpillCellWrite`); it now LANDS, the array is withdrawn whole,
//! and the anchor re-projects as `#SPILL!`. 71 addresses move across all 5
//! seeds (~1.8% of 3990 lines):
//!
//!   * 13 anchors `A:RxC[..]` -> `E:#SPILL!` — a later write landed inside the
//!     rectangle they owned (seed 11 Beta!K22 / Gamma!D15 / Gamma!K11, seed 23
//!     Sheet1!H10/H21/M12, seed 37 Sheet1!C29/J25 + Beta!L32, seed 41 Beta!L5 /
//!     Beta!S26 / Gamma!F20 / Gamma!H2). ZERO move the other way: no anchor
//!     that read `#SPILL!` before reads an array now, which is the shape a
//!     write-lands-and-withdraws change must have.
//!   * Those 13 anchors owned 36 target cells (10 x `SEQUENCE(2,2)` x 3 + 3 x
//!     `SEQUENCE(3,1)` x 2). Every one of the 36 is accounted for: 18 VANISH
//!     from the snapshot (they counted as non-empty only because a derived
//!     projection atom sat in the slot — exactly the 18 deleted lines), 13 now
//!     show the literal the old engine dropped, and 5 now carry their own
//!     formula (the formula write used to be refused).
//!   * 17 inserted lines — second-order. The op stream is fixed, so a landed
//!     write shifts what later clears / structural edits / bulk loads find
//!     (e.g. seed 11 Sheet1!F29=429, Beta!O30=24).
//!   * 19 value changes: 13 of the overwritten targets above, plus 3 downstream
//!     formulas re-reading them (seed 11 Gamma!F8 `=COUNT(A1:D22)` 24 -> 22,
//!     seed 23 Sheet1!K34 `=IF((C31>10),I22,0)` 4 -> 175, seed 53 Beta!G6
//!     `=(K28+1)` 1 -> 33), plus the 3 targets that changed formula.
//!   * 4 cells reach `#SPILL!` from something other than an array: seed 37
//!     Sheet1!C30 and seed 41 Gamma!G21 were projection cells and now hold
//!     their OWN `SEQUENCE(3,1,..)`, which collides in turn; seed 53 Beta!D40
//!     `=SEQUENCE(3,1,C4)` and its reader Gamma!J33 `=Beta!D40*2` go
//!     `E:#TYPE!` -> `E:#SPILL!` because D41 — one of the newly-landed
//!     literals — now sits inside D40's 3x1 box. C4 is `T:t44` in BOTH
//!     snapshots: the argument did not drift, the rectangle got blocked.
//!
//! Closed form: live arrays 31 -> 18 (-13) and `#SPILL!` 52 -> 69 (+17) = the
//! 13 withdrawn anchors plus those 4 promotions.
//!
//! The first divergence in EVERY seed is a bulk load (op kind 80..=84, a batch
//! of 20 literals) whose batch contains one cell inside a live spill region:
//! seed 11 op 59 (Beta!I35=432 inside `I33 =SEQUENCE(3,1,C38)`), seed 23 op 267
//! (Sheet1!B25=309 inside `B24 =SEQUENCE(3,1,F1)`), seed 37 op 177
//! (Sheet1!L28=211 inside `K27 =SEQUENCE(2,2)`), seed 41 op 175 (Gamma!J36=368
//! inside `I36 =SEQUENCE(2,2)`), seed 53 op 170 (Beta!H40=339 inside
//! `G40 =SEQUENCE(2,2)`). The remaining ~1800 ops redistribute it.
//!
//! Provenance was established BEFORE any fixture byte moved: a temporary
//! kill-switch reverted stage 1 (the six write guards) and stage 2's
//! write-driven revive while KEEPING stage 0, and regenerating under it
//! reproduced all five committed fixtures byte-for-byte. Every line of the
//! diff below is therefore attributable to this change and nothing else.
//! Stage 2's teardown-driven revive and the row-major sort in
//! `recompute_array_formulas_in` were toggled independently and move ZERO
//! fixture bytes — unreachable on these op streams. Corrections were applied
//! as assert-the-original-then-replace hunks (8/8/10/12/7 per seed) and the
//! result byte-compared against the engine snapshot; fixtures were NOT
//! regenerated.
//!
//! Post-fix the end states still satisfy the stage 0 invariant (a `SEQUENCE`
//! anchor reads `#SPILL!` only when its box is genuinely occupied: 7 violations
//! at HEAD, 0 before this change, 0 after) and every spilled anchor still owns
//! its full rectangle. The stage 1 invariant is new and also holds: no live
//! array's rectangle contains a cell carrying its own formula — the collapse is
//! never left half-applied.
//!
//! Every future replay mismatch remains an unapproved behavior change. Do NOT
//! regenerate fixtures to make a phase green; that defeats the oracle
//! (WORKPLAN §6).

use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

/// Same LCG as tests/scale_suite.rs — deterministic, seedable.
struct Lcg(u64);

impl Lcg {
    fn new(seed: u64) -> Self {
        Lcg(seed)
    }
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

const SEEDS: [u64; 5] = [11, 23, 37, 41, 53];
const OPS_PER_SEED: usize = 2000;
const ROWS: u64 = 40;
const COLS: u64 = 12;
const SHEETS: [&str; 3] = ["Sheet1", "Beta", "Gamma"];

fn col_name(col: u64) -> String {
    // cols 0..12 stay single-letter; keep simple
    ((b'A' + col as u8) as char).to_string()
}

fn addr(rng: &mut Lcg) -> String {
    format!("{}{}", col_name(rng.below(COLS)), rng.below(ROWS) + 1)
}

/// A pool of formula templates covering point refs, aggregates, ranges,
/// cross-sheet refs, spills, conditionals and occasional cycle attempts.
/// `{A}`/`{B}` are replaced with random in-grid addresses.
const FORMULA_TEMPLATES: [&str; 14] = [
    "={A}+1",
    "={A}*2+{B}",
    "=SUM(A1:C10)",
    "=SUM(B:B)",
    "=COUNT(A1:D20)",
    "=AVERAGE(A1:A10)",
    "=IF({A}>10,{B},0)",
    "=Beta!{A}*2",
    "=Gamma!{A}+Sheet1!{B}",
    "=SEQUENCE(2,2)",
    "=SEQUENCE(3,1,{A})",
    "=MAX(A1:B5)+MIN(C1:C10)",
    "=LEN(CONCAT({A},\"x\"))",
    "={A}",
];

fn build_workbook(seed: u64, operation_count: usize) -> Workbook {
    let mut rng = Lcg::new(seed);
    let mut wb = Workbook::new(); // creates "Sheet1"
    wb.add_sheet("Beta");
    wb.add_sheet("Gamma");
    let trace = std::env::var_os("EINFACH_GOLDEN_TRACE").is_some();
    let trace_from = std::env::var("EINFACH_GOLDEN_TRACE_FROM")
        .ok()
        .map(|value| {
            value
                .parse::<usize>()
                .expect("EINFACH_GOLDEN_TRACE_FROM must be a usize")
        })
        .unwrap_or_default();

    for operation_index in 0..operation_count {
        let sheet_idx = rng.below(SHEETS.len() as u64) as usize;
        let operation_kind = rng.below(100);
        if trace && operation_index >= trace_from {
            eprintln!(
                "golden seed={seed} operation={operation_index} sheet={sheet_idx} kind={operation_kind}"
            );
        }
        match operation_kind {
            // 30% scalar writes
            0..=29 => {
                let a = addr(&mut rng);
                let v = match rng.below(3) {
                    0 => Value::Number(rng.below(1000) as f64 / 4.0),
                    1 => Value::Text(format!("t{}", rng.below(50))),
                    _ => Value::Boolean(rng.below(2) == 0),
                };
                wb.set_cell(sheet_idx, &a, v);
            }
            // 25% formula installs (cycle attempts included — deterministic
            // Ok(false) + #CYCLE! literal is part of the pinned behavior)
            30..=54 => {
                let a = addr(&mut rng);
                let template = FORMULA_TEMPLATES[rng.below(14) as usize];
                let f = template
                    .replace("{A}", &addr(&mut rng))
                    .replace("{B}", &addr(&mut rng));
                let _ = wb.set_formula(sheet_idx, &a, &f);
            }
            // 10% clears
            55..=64 => {
                let a = addr(&mut rng);
                wb.clear_cell(sheet_idx, &a);
            }
            // 5% range clears
            65..=69 => {
                let r0 = rng.below(ROWS) as u32;
                let c0 = rng.below(COLS) as u32;
                let r1 = (r0 + rng.below(5) as u32).min(ROWS as u32 - 1);
                let c1 = (c0 + rng.below(3) as u32).min(COLS as u32 - 1);
                let range = CellRange::new(CellAddress::new(r0, c0), CellAddress::new(r1, c1));
                wb.clear_range(sheet_idx, range);
            }
            // 10% structural edits
            70..=79 => {
                let at = rng.below(ROWS / 2) as u32;
                let count = rng.below(2) as u32 + 1;
                let structural_kind = rng.below(4);
                let sheet = wb.sheet_mut(sheet_idx).expect("sheet");
                match structural_kind {
                    0 => {
                        if trace && operation_index >= trace_from {
                            eprintln!("  insert_row at={at} count={count}");
                        }
                        sheet.insert_row(at, count);
                    }
                    1 => {
                        if trace && operation_index >= trace_from {
                            eprintln!("  delete_row at={at} count={count}");
                        }
                        sheet.delete_row(at, count);
                    }
                    2 => {
                        let col = rng.below(COLS / 2) as u32;
                        if trace && operation_index >= trace_from {
                            eprintln!("  insert_col at={col} count=1");
                        }
                        sheet.insert_col(col, 1);
                    }
                    _ => {
                        let col = rng.below(COLS / 2) as u32;
                        if trace && operation_index >= trace_from {
                            eprintln!("  delete_col at={col} count=1");
                        }
                        sheet.delete_col(col, 1);
                    }
                }
            }
            // 5% bulk loads (batch of 20)
            80..=84 => {
                let mut cells: Vec<(usize, String, Value)> = Vec::new();
                for _ in 0..20 {
                    let s = rng.below(SHEETS.len() as u64) as usize;
                    let a = addr(&mut rng);
                    let v = Value::Number(rng.below(500) as f64);
                    cells.push((s, a, v));
                }
                wb.bulk_load(|loader| {
                    for (s, a, v) in cells {
                        loader.set_cell(s, &a, v);
                    }
                });
            }
            // 15% read sampling (hydrates/evaluates — part of the sequence)
            _ => {
                let a = addr(&mut rng);
                let name = SHEETS[sheet_idx];
                let _ = wb.get_cell(name, &a);
            }
        }
    }
    wb
}

/// Canonical, engine-agnostic rendering of a Value. `{:?}` on f64 gives a
/// stable shortest-roundtrip repr on all supported toolchains.
fn render(v: &Value) -> String {
    match v {
        Value::Null => "∅".to_string(),
        Value::Number(n) => format!("N:{:?}", n),
        Value::Text(t) => format!("T:{}", t),
        Value::Boolean(b) => format!("B:{}", b),
        Value::Error(e) => format!("E:{}", e),
        Value::Array(arr) => {
            let (rows, cols) = arr.shape();
            let mut out = format!("A:{}x{}[", rows, cols);
            for r in 0..rows {
                for c in 0..cols {
                    if let Some(cell) = arr.get(r, c) {
                        out.push_str(&render(cell));
                    }
                    out.push(';');
                }
            }
            out.push(']');
            out
        }
        Value::Lambda(_) => "L:<lambda>".to_string(),
    }
}

fn snapshot(wb: &Workbook) -> String {
    let mut out = String::new();
    for (idx, name) in SHEETS.iter().enumerate() {
        out.push_str(&format!("== sheet {} ({}) ==\n", idx, name));
        let sheet = wb.sheet(idx).expect("sheet exists");
        let mut addrs = sheet.non_empty_addrs();
        addrs.sort();
        for a in addrs {
            let v = wb.get_cell(name, &a);
            let formula = sheet.get_formula(&a).unwrap_or_default();
            out.push_str(&format!("{} = {} | f: {}\n", a, render(&v), formula));
        }
    }
    out
}

fn fixture_path(seed: u64) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(format!("golden_seed_{}.txt", seed))
}

/// One-time generator (P0). Run against the PRE-REWRITE engine only:
/// `cargo test --test golden_replay golden_generate -- --ignored`
#[test]
#[ignore]
fn golden_generate() {
    std::fs::create_dir_all(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures"),
    )
    .expect("mkdir fixtures");
    for seed in SEEDS {
        let wb = build_workbook(seed, OPS_PER_SEED);
        let snap = snapshot(&wb);
        std::fs::write(fixture_path(seed), &snap).expect("write fixture");
        // A snapshot that is trivially empty would fence nothing.
        assert!(
            snap.lines().count() > 50,
            "seed {} produced a degenerate snapshot",
            seed
        );
    }
}

#[test]
fn golden_replay_all_seeds() {
    let report_all = std::env::var_os("EINFACH_GOLDEN_REPORT_ALL").is_some();
    let selected_seed = std::env::var("EINFACH_GOLDEN_SEED").ok().map(|value| {
        value
            .parse::<u64>()
            .expect("EINFACH_GOLDEN_SEED must be a u64")
    });
    let operation_count = std::env::var("EINFACH_GOLDEN_OPS")
        .ok()
        .map(|value| {
            value
                .parse::<usize>()
                .expect("EINFACH_GOLDEN_OPS must be a usize")
        })
        .unwrap_or(OPS_PER_SEED);
    assert!(
        operation_count <= OPS_PER_SEED,
        "EINFACH_GOLDEN_OPS cannot exceed {OPS_PER_SEED}"
    );
    let mut mismatches = Vec::new();
    for seed in SEEDS
        .into_iter()
        .filter(|seed| selected_seed.is_none_or(|selected| *seed == selected))
    {
        let expected = std::fs::read_to_string(fixture_path(seed)).unwrap_or_else(|_| {
            panic!(
                "missing fixture for seed {} — run the P0 generator first \
                 (cargo test --test golden_replay golden_generate -- --ignored)",
                seed
            )
        });
        let wb = build_workbook(seed, operation_count);
        let actual = snapshot(&wb);
        if operation_count != OPS_PER_SEED {
            eprintln!("golden diagnostic build completed seed={seed} operations={operation_count}");
            continue;
        }
        if expected != actual {
            // Default to the first diff so ordinary CI logs stay compact.
            // The opt-in report is useful when reviewing an explicitly
            // approved oracle migration without regenerating the fixtures.
            for (i, (e, a)) in expected.lines().zip(actual.lines()).enumerate() {
                if e != a {
                    let mismatch = format!(
                        "golden replay mismatch (seed {seed}) at line {}:\n  expected: {e}\n  actual:   {a}\n\
                         An unapproved observable-behavior change — see WORKPLAN §6.",
                        i + 1
                    );
                    if !report_all {
                        panic!("{mismatch}");
                    }
                    mismatches.push(mismatch);
                }
            }
            let expected_len = expected.lines().count();
            let actual_len = actual.lines().count();
            if expected_len != actual_len {
                let mismatch = format!(
                    "golden replay mismatch (seed {seed}): line count {expected_len} -> {actual_len}"
                );
                if !report_all {
                    panic!("{mismatch}");
                }
                mismatches.push(mismatch);
            }
        }
    }
    assert!(
        mismatches.is_empty(),
        "{} golden replay mismatch(es):\n{}",
        mismatches.len(),
        mismatches.join("\n")
    );
}
