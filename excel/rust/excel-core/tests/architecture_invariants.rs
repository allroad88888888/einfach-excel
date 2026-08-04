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
use std::path::{Path, PathBuf};

/// Current rewrite phase. Advance ONLY at a phase exit gate (WORKPLAN §3).
const PHASE: u8 = 7;

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()))
}

/// 截掉 `#[cfg(test)]` 之后的测试尾巴，只留生产代码。
fn production(source: &str) -> String {
    source.split("#[cfg(test)]").next().unwrap_or(source).to_string()
}

/// sheet 家族**逐文件**的生产代码：`sheet.rs` 加上所有 `src/sheet_*.rs`。
///
/// 为什么要枚举整个家族：这些代码原本全住在 `sheet.rs` 里，本测试按文本扫它。
/// 拆出去的部分若不一起扫，就等于**搬家即脱离门禁** —— 上一轮 spill 拆分正是
/// 这样让 `sheet_spill.rs` 与 `sheet_spill_maintenance.rs` 漏网的，这一轮
/// `sheet.rs` 从 10561 行降到 2681 行，漏网面积会再放大一个量级。
/// 用 `read_dir` 而不是写死清单，是为了让**将来新拆出的** `sheet_*.rs` 自动进网。
///
/// 注意必须**逐文件先截测试尾巴再拼**：先拼后截会从第一个带测试的文件处整体
/// 截断，把它后面的所有文件悄悄排除掉。
fn sheet_family_sources() -> Vec<(String, String)> {
    let dir = manifest_dir().join("src");
    let mut names: Vec<String> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.starts_with("sheet_") && n.ends_with(".rs"))
        .collect();
    names.sort();
    let mut out = vec![(
        "sheet".to_string(),
        production(&read(&dir.join("sheet.rs"))),
    )];
    for name in names {
        let src = production(&read(&dir.join(&name)));
        out.push((name.trim_end_matches(".rs").to_string(), src));
    }
    out
}

/// 整个 sheet 家族的生产代码拼接。正向断言（接线锚点、出现次数）用它。
fn sheet_rs() -> String {
    sheet_family_sources()
        .into_iter()
        .map(|(_, src)| src)
        .collect::<Vec<_>>()
        .join("\n")
}

fn workbook_rs() -> String {
    read(&manifest_dir().join("src/workbook.rs"))
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

fn wasm_lib_rs() -> String {
    read(&manifest_dir().join("../wasm/src/lib.rs"))
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
/// shapes in.
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

#[test]
fn forbidden_identifiers_absent_for_current_phase() {
    let mut violations = Vec::new();
    for (ident, from_phase, files) in FORBIDDEN {
        if PHASE < *from_phase {
            continue;
        }
        for key in *files {
            let src = file_by_key(key);
            if src.contains(ident) {
                violations.push(format!(
                    "{key}.rs still contains `{ident}` (forbidden since P{from_phase})"
                ));
            }
        }
    }
    assert!(
        violations.is_empty(),
        "parallel-graph machinery survived its deletion phase:\n  {}\nSee WORKPLAN §2/§6.",
        violations.join("\n  ")
    );
}

#[test]
fn forbidden_type_shapes_absent_for_current_phase() {
    let strip = |s: &str| s.replace([' ', '\n', '\t'], "");
    // 逐文件扫而不是拼起来扫：违规信息要点得出**具体哪个文件**。
    let mut sources: Vec<(String, String)> = sheet_family_sources()
        .into_iter()
        .map(|(name, src)| (name, strip(&src)))
        .collect();
    sources.push(("workbook".to_string(), strip(&workbook_rs())));
    let mut violations = Vec::new();
    for (shape, from_phase) in FORBIDDEN_SHAPES {
        if PHASE < *from_phase {
            continue;
        }
        for (name, src) in &sources {
            if src.contains(shape) {
                violations.push(format!(
                    "{name}.rs contains forbidden dep-graph shape `{shape}`"
                ));
            }
        }
    }
    assert!(
        violations.is_empty(),
        "address→formula dependency shape reintroduced (INV-2):\n  {}",
        violations.join("\n  ")
    );
}

#[test]
fn required_store_functions_present_for_current_phase() {
    let src = store_rs();
    let missing: Vec<&str> = REQUIRED_STORE_FNS
        .iter()
        .filter(|(_, from)| PHASE >= *from)
        .filter(|(f, _)| !src.contains(f))
        .map(|(f, _)| *f)
        .collect();
    assert!(
        missing.is_empty(),
        "store.rs is missing store.ts-isomorphic functions (INV-1): {missing:?}"
    );
}

#[test]
fn required_sheet_store_wiring_present_for_current_phase() {
    let source = sheet_rs();
    let production = source.split("#[cfg(test)]").next().unwrap_or(&source);
    let compact = production.replace([' ', '\n', '\r', '\t'], "");
    let missing: Vec<&str> = REQUIRED_SHEET_WIRING
        .iter()
        .filter(|(_, from)| PHASE >= *from)
        .filter(|(shape, _)| !compact.contains(shape))
        .map(|(shape, _)| *shape)
        .collect();
    assert!(
        missing.is_empty(),
        "sheet.rs is missing Store-owned formula/range wiring (INV-1/INV-2): {missing:?}"
    );
}

#[test]
fn required_workbook_store_wiring_present_for_current_phase() {
    let source = workbook_rs();
    let production = source.split("#[cfg(test)]").next().unwrap_or(&source);
    let compact = production.replace([' ', '\n', '\r', '\t'], "");
    let missing: Vec<&str> = REQUIRED_WORKBOOK_WIRING
        .iter()
        .filter(|(_, from)| PHASE >= *from)
        .filter(|(shape, _)| !compact.contains(shape))
        .map(|(shape, _)| *shape)
        .collect();
    assert!(
        missing.is_empty(),
        "workbook.rs is missing shared Store/context wiring (INV-1/INV-2): {missing:?}"
    );
}

/// Formula cells have exactly one production evaluation entry, and that entry
/// is the Store-owned formula-inner body pinned by REQUIRED_SHEET_WIRING.
/// Workbook's one direct evaluator is reserved for top-level defined-name
/// construction; it must never become a second formula-cell value path.
#[test]
fn formula_cell_evaluation_has_one_store_owned_entry() {
    let sheet = sheet_rs();
    let sheet_production = sheet.split("#[cfg(test)]").next().unwrap_or(&sheet);
    assert_eq!(
        sheet_production.matches("eval_expr_with_provider(").count(),
        1,
        "formula-cell evaluation gained a parallel entry outside formula-inner"
    );

    let workbook = workbook_rs();
    let workbook_production = workbook.split("#[cfg(test)]").next().unwrap_or(&workbook);
    assert_eq!(
        workbook_production
            .matches("eval_expr_with_provider(")
            .count(),
        1,
        "workbook direct evaluation must stay limited to top-level defined-name construction"
    );
}

/// FormulaRecord may retain AST/reference metadata for structural edits and a
/// topology-generation stamp for static validation, but formula values and
/// reactive freshness belong exclusively to Store derived atoms.
#[test]
fn formula_record_is_structural_metadata_only() {
    let source = sheet_rs();
    let (_, after_start) = source
        .split_once("pub(crate) struct FormulaRecord {")
        .expect("FormulaRecord declaration");
    let (body, _) = after_start
        .split_once("\n}")
        .expect("FormulaRecord closing brace");
    let fields: Vec<&str> = body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("///"))
        .collect();
    assert_eq!(
        fields,
        [
            "expr: Rc<Expr>,",
            "cycle_checked_at: Cell<u64>,",
            "deps: RefCell<HashSet<CellAddress>>,",
            "static_ranges: RefCell<HashSet<CellRange>>,",
        ],
        "FormulaRecord acquired response state; formula results/reactive freshness must stay in Store"
    );
}

/// P7 removes the worker-boundary dirty/clean simulation. Debug state must be
/// a direct projection of the TS workbook's atomm-derived formula state.
#[test]
fn ts_worker_formula_debug_state_has_no_shadow_override() {
    if PHASE < 7 {
        return;
    }

    let source = worker_runtime_ts();
    let compact = source.replace([' ', '\n', '\r', '\t'], "");
    assert!(
        compact.contains(
            "case'debugFormulaCacheState':returnstate.workbook.debugFormulaCacheState(\
             Number(msg.sheet),String(msg.addr??''))"
        ),
        "P7 requires debugFormulaCacheState to delegate directly to workbook state"
    );

    let retired_shadow_state = [
        "readFormulaCells",
        "markFormulaRead",
        "hasFormulaRead",
        "invalidateReadOnMutation",
    ];
    let survived: Vec<&str> = retired_shadow_state
        .into_iter()
        .filter(|name| source.contains(name))
        .collect();
    assert!(
        survived.is_empty(),
        "P7 worker debug shadow state reintroduced: {survived:?}"
    );
}

/// INV-8: transitional code is tagged `BRIDGE(delete-by: P<n>-exit)` and none
/// of it survives P6. At every phase, ALL occurrences of the word BRIDGE in
/// the reactive-core files must be well-formed markers whose phase has not
/// already passed (codex P0 review P3: malformed/untagged shims must not
/// evade the policy).
#[test]
fn bridge_markers_within_policy() {
    let mut total = 0;
    let mut violations = Vec::new();
    for key in ["sheet", "workbook", "store"] {
        let src = file_by_key(key);
        for (line_no, line) in src.lines().enumerate() {
            let mut rest = line;
            while let Some(pos) = rest.find("BRIDGE") {
                rest = &rest[pos + "BRIDGE".len()..];
                total += 1;
                let phase = rest
                    .strip_prefix("(delete-by: P")
                    .and_then(|t| t.chars().next())
                    .and_then(|c| c.to_digit(10))
                    .filter(|_| rest.contains("-exit)"));
                match phase {
                    None => violations.push(format!(
                        "{key}.rs:{}: BRIDGE without well-formed `(delete-by: P<n>-exit)` tag",
                        line_no + 1
                    )),
                    Some(p) if (PHASE as u32) >= p => violations.push(format!(
                        "{key}.rs:{}: BRIDGE(delete-by: P{p}-exit) survived past its phase (now P{PHASE})",
                        line_no + 1
                    )),
                    Some(_) => {}
                }
            }
        }
    }
    assert!(
        violations.is_empty(),
        "INV-8 violations:\n  {}",
        violations.join("\n  ")
    );
    if PHASE >= 6 {
        assert_eq!(total, 0, "INV-8: {total} BRIDGE marker(s) survived P6 exit");
    }
}

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

/// Full-fidelity signature capture (codex P0 review P2): each entry is
/// `<impl owner> :: <wasm_bindgen attrs incl. js_name> :: <complete signature>`,
/// with multi-line signatures joined until the body brace and whitespace
/// normalized. Renaming a js_name, changing a parameter on a wrapped line,
/// or moving a method between impls all change the captured entry.
fn extract_wasm_signatures(src: &str) -> Vec<String> {
    let normalize = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut sigs = Vec::new();
    let mut owner = String::from("<free>");
    let mut pending_attrs: Vec<String> = Vec::new();
    let mut lines = src.lines().map(str::trim).peekable();
    while let Some(line) = lines.next() {
        if line.starts_with("impl ") {
            owner = normalize(line.trim_end_matches('{').trim());
            pending_attrs.clear();
        } else if line.starts_with("#[wasm_bindgen") {
            // attribute may itself wrap lines until its closing `]`
            let mut attr = line.to_string();
            while !attr.trim_end().ends_with(']') {
                match lines.next() {
                    Some(cont) => attr.push_str(cont),
                    None => break,
                }
            }
            pending_attrs.push(normalize(&attr));
        } else if line.starts_with("pub fn ") {
            let mut sig = line.to_string();
            while !sig.contains('{') && !sig.trim_end().ends_with(';') {
                match lines.next() {
                    Some(cont) => {
                        sig.push(' ');
                        sig.push_str(cont);
                    }
                    None => break,
                }
            }
            let sig = normalize(sig.split('{').next().unwrap_or(&sig).trim());
            sigs.push(format!("{owner} :: [{}] :: {sig}", pending_attrs.join(" ")));
            pending_attrs.clear();
        } else if !line.starts_with("#[") && !line.is_empty() && !line.starts_with("//") {
            // any other code line breaks attr→fn adjacency
            pending_attrs.clear();
        }
    }
    sigs.sort();
    sigs
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
