//! Executable tripwires for the atom-delegation rewrite.
//!
//! See `excel/rust/docs/ATOM_DELEGATION_REWRITE_PLAN.md`. These tests read source
//! files and assert on the ABSENCE of parallel-dependency-graph machinery
//! (phase-gated) and the STABILITY of the WASM public API. A future agent
//! that reintroduces an address→formula index — even one that passes every
//! behavioral test — fails here. That is the point (WORKPLAN §6: doing so
//! without an INV amendment is a P0 defect).
//!
//! Phase progression is a one-line edit of `PHASE` below, landed in the same
//! commit as the phase's exit gate — loud and reviewable by design.

use std::fs;

#[path = "support/architecture_sources.rs"]
mod architecture_sources;
#[path = "support/wasm_api_signatures.rs"]
mod wasm_api_signatures;

use architecture_sources::{manifest_dir, read, source_family_sources, source_family_text};
use wasm_api_signatures::extract_wasm_signatures;

/// Current rewrite phase. Advance ONLY at a phase exit gate (WORKPLAN §3).
const PHASE: u8 = 7;

/// sheet 家族**逐文件**的生产代码：`sheet.rs` 加上所有 `src/sheet_*.rs`。
fn sheet_family_sources() -> Vec<(String, String)> {
    source_family_sources("src/sheet.rs", "sheet_")
}

/// 整个 sheet 家族的生产代码拼接。正向断言（接线锚点、出现次数）用它。
fn sheet_rs() -> String {
    source_family_text("src/sheet.rs", "sheet_")
}

fn workbook_family_sources() -> Vec<(String, String)> {
    source_family_sources("src/workbook.rs", "workbook_")
}

fn workbook_rs() -> String {
    source_family_text("src/workbook.rs", "workbook_")
}

fn eval_family_sources() -> Vec<(String, String)> {
    source_family_sources("src/eval.rs", "eval_")
}

// `sheet_spill_claims.rs` / `sheet_spill_blocker.rs` 曾各有一个专用读取函数。
// 现在它们由 `sheet_family_sources()` 的 `sheet_*.rs` 通配自动覆盖，专用函数已删。
// 它们当初被单列的理由仍然成立、并且现在适用于整个家族：
//   - ADR 0006 阶段 2 把一个 INV-2 白名单内的 `addr → anchor` 索引（spill
//     `claims`）放进了自己的模块。扫它，是为了让「搬进独立模块」是**遵守**
//     形状禁令的方式，而不是**绕过**它的方式 —— 白名单索引可以存在，但仍须
//     避开每一条被禁的形状。
//   - `#SPILL!` 阻塞查询什么都不存（按需从活单元格重算），照扫不误。

fn store_rs() -> String {
    read(&manifest_dir().join("../core/src/store.rs"))
}

fn wasm_family_sources() -> Vec<(String, String)> {
    source_family_sources("../wasm/src/lib.rs", "wasm_")
}

fn wasm_lib_rs() -> String {
    wasm_family_sources()
        .into_iter()
        .map(|(_, source)| source)
        .collect::<Vec<_>>()
        .join("\n")
}

fn worker_runtime_ts() -> String {
    read(&manifest_dir().join("../../solid-excel/src-vnext/adapter/worker-runtime-ts.ts"))
}

/// Identifiers that must be GONE once the given phase is reached.
/// (identifier, first-phase-where-forbidden, files-to-check)
const FORBIDDEN: &[(&str, u8, &[&str])] = &[
    // P4 exit: point-dependency half of the parallel graph deleted
    ("cell_dependents", 4, &["sheet", "workbook"]),
    ("mark_dependents_dirty", 4, &["sheet", "workbook"]),
    // P5 exit: range index deleted
    ("RangeDependentIndex", 5, &["sheet", "workbook"]),
    ("range_dependents", 5, &["sheet", "workbook"]),
    ("coalesced_dirty_into", 5, &["sheet"]),
    // P6 exit: everything else
    ("CrossSheetDeps", 6, &["sheet", "workbook"]),
    ("WorkbookRangeBridgeIndex", 6, &["sheet", "workbook"]),
    ("has_cross_sheet_refs", 6, &["sheet", "workbook"]),
    ("formula_needs_provider_context", 6, &["sheet", "workbook"]),
    ("force_formula_recompute", 6, &["sheet", "workbook"]),
    ("mark_dirty_for_addr", 6, &["sheet", "workbook"]),
    (
        "eval_cross_sheet_formula_eager_with_provider",
        6,
        &["sheet", "workbook"],
    ),
    ("prewarm_formula_chain", 6, &["sheet"]),
    ("collect_prewarm_refs", 6, &["sheet"]),
    ("would_create_cycle", 6, &["sheet", "workbook"]),
    ("FormulaCache", 6, &["sheet", "workbook"]),
    ("dirty_visit_count", 6, &["sheet", "workbook"]),
    // P6 exit: the old eager-push store machinery
    ("topological_sort", 6, &["store"]),
    ("collect_affected", 6, &["store"]),
    ("propagate_and_notify", 6, &["store"]),
    ("propagate_force", 6, &["store"]),
    ("force_recompute_derived", 6, &["store"]),
];

/// Type shapes that constitute a parallel dependency graph, whatever they
/// are named. Checked whitespace-insensitively from P4 on. INV-2 allowlist
/// lives in dedicated modules (range family geometry, spill claims) — those
/// map addresses to range keys / anchors, never to dependent formula cells,
/// and they must not use these shapes. The two spill side modules are scanned
/// alongside `sheet.rs` / `workbook.rs` so "moved to its own module" — or "it
/// is only a diagnostic" — can never become a way to smuggle one of these
/// shapes in. The eval family is also scanned so an evaluator split cannot
/// evade this gate.
const FORBIDDEN_SHAPES: &[(&str, u8)] = &[
    ("HashMap<CellAddress,HashSet<CellAddress", 4),
    ("HashMap<CellAddress,Vec<CellAddress", 4),
    ("BTreeMap<CellAddress,HashSet<CellAddress", 4),
    ("BTreeMap<CellAddress,Vec<CellAddress", 4),
    ("RowMajorMap<HashSet<CellAddress", 4),
    ("RowMajorMap<Vec<CellAddress", 4),
    ("HashMap<(usize,CellAddress),HashSet", 6),
];

/// Functions that must EXIST in the faithful store from P1 on (positive
/// isomorphism smoke — INV-1).
const REQUIRED_STORE_FNS: &[(&str, u8)] = &[
    ("fn read_atom", 1),
    ("fn dependencies_change", 1),
    ("fn flush_pending", 1),
    ("fn publish_atom", 1),
    ("fn subscribe_atom", 1),
];

/// Production wiring that keeps same-sheet formula derivation and range
/// invalidation inside Store. Whitespace is stripped before matching so
/// formatting alone cannot trip the guard.
const REQUIRED_SHEET_WIRING: &[(&str, u8)] = &[
    (
        "ctx.owned_create_derived_ctx(move|args|ctx_read.eval_formula_inner(addr,args))",
        4,
    ),
    (
        "letinner=ctx.formula_inner_of(addr);letformula_value=args.get(inner);",
        4,
    ),
    (
        "letfacade=self.facade_of(addr);returnself.store.get(facade);",
        4,
    ),
    ("self.store.reverse_dependents(root_atoms)", 5),
    ("args.depend(self.range_band_epoch_of(", 5),
    ("args.depend(self.range_column_epoch_of(", 5),
    ("args.depend(self.range_sheet_epoch())", 5),
    (
        "collapse_array_for_eval(self.read_facade_from(&ctx,addr))",
        6,
    ),
    ("self.for_each_range_in(&ctx,range,f);", 6),
    ("self.workbook_context()?.lookup_named(name,self.args)", 6),
    (
        "self.workbook_context()?.call_custom(name,values,self.args)",
        6,
    ),
    ("self.depend_topology(args);", 6),
    ("self.depend_names(args);", 6),
    ("self.depend_custom(args);", 6),
    // P7 cold-hydration follow-up: static cycle certificates live on the
    // already-owned formula entries and are generation-invalidated. They are
    // validation metadata only; the forbidden-shape checks above continue to
    // ban a retained address→dependent response graph.
    ("cycle_checked_at:Cell<u64>", 7),
    ("formula_topology_epoch:Cell<u64>", 7),
    ("fncloses_parked_local_cycle(", 7),
    (
        "self.mark_formula_cycle_checked(nodes[index].addr,epoch);",
        7,
    ),
];

/// Workbook construction/topology wiring that makes every sheet resolve
/// through the same Store and workbook atom context at P6.
const REQUIRED_WORKBOOK_WIRING: &[(&str, u8)] = &[
    (
        "WorkbookAtomContext::new(store.clone(),Rc::clone(&custom_call_depth))",
        6,
    ),
    ("sheet.attach_workbook_context(&self.atom_context,idx);", 6),
    ("self.atom_context.sync_topology(sheets);", 6),
];

fn file_by_key(key: &str) -> String {
    match key {
        "sheet" => sheet_rs(),
        "workbook" => workbook_rs(),
        "store" => store_rs(),
        other => panic!("unknown file key {other}"),
    }
}

include!("support/architecture_dependency_guards.rs");
include!("support/architecture_formula_invariants.rs");
include!("support/architecture_bridge_invariants.rs");

/// INV-4: the WASM public surface is frozen. Snapshot committed at P0;
/// additive-only changes require regenerating the snapshot IN THE SAME
/// commit with the addition visible in the diff.
#[test]
fn wasm_public_api_signatures_unchanged() {
    let snapshot_path = manifest_dir().join("tests/fixtures/wasm_api_signatures.txt");
    let expected = read(&snapshot_path);
    let actual = extract_wasm_signatures(&wasm_lib_rs());
    let expected_set: Vec<&str> = expected.lines().filter(|l| !l.is_empty()).collect();
    let actual_set: Vec<String> = actual;

    // Removals / modifications are hard failures; additions demand a
    // regenerated snapshot so the diff is explicit.
    let mut missing = Vec::new();
    for sig in &expected_set {
        if !actual_set.iter().any(|a| a == sig) {
            missing.push(*sig);
        }
    }
    assert!(
        missing.is_empty(),
        "INV-4: WASM public API signatures removed/changed:\n  {}",
        missing.join("\n  ")
    );
    let mut added = Vec::new();
    for sig in &actual_set {
        if !expected_set.iter().any(|e| e == sig) {
            added.push(sig.clone());
        }
    }
    assert!(
        added.is_empty(),
        "WASM public API grew without regenerating the snapshot (allowed only \
         additively + in the same commit):\n  {}\nRegenerate: cargo test --test \
         architecture_invariants wasm_snapshot_generate -- --ignored",
        added.join("\n  ")
    );
}

/// One-time snapshot generator (P0), rerun only for approved additive changes.
#[test]
#[ignore]
fn wasm_snapshot_generate() {
    let dir = manifest_dir().join("tests/fixtures");
    fs::create_dir_all(&dir).expect("mkdir fixtures");
    let sigs = extract_wasm_signatures(&wasm_lib_rs());
    assert!(
        sigs.len() > 100,
        "suspiciously few WASM signatures: {}",
        sigs.len()
    );
    fs::write(dir.join("wasm_api_signatures.txt"), sigs.join("\n") + "\n").expect("write snapshot");
}
