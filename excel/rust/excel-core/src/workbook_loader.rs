//! workbook loader implementation.

use super::*;

enum WorkbookOp {
    /// Typed address (A-9 follow-up, 2026-06-13 P3): producers parse or
    /// construct the `CellAddress` exactly once at the public boundary;
    /// replay routes `BulkLoader::set_cell_at`. Carrying a `String`
    /// here meant one alloc + one re-parse per op in bulk paths whose
    /// producers already hold a typed address (`restore_sparse`).
    SetCell { addr: CellAddress, value: Value },
    /// `expr` is `Some` when the workbook-side parse succeeded — the
    /// sheet-side flush installs directly without re-parsing. `None`
    /// covers the parse-failure path: the sheet's `set_formula` sees a
    /// malformed string, writes `#VALUE!`, and never touches the AST.
    /// Eliminating the double-parse was the dominant constant-factor
    /// win for the wasm32 Chain100k bulkWrite tier — `parse_formula`
    /// allocates a `Vec<char>` per source character plus boxed nodes
    /// for every binop / cellref, and was running twice per formula
    /// (workbook + sheet) before this variant. The address is typed
    /// for the same reason as `SetCell`.
    SetFormula {
        addr: CellAddress,
        source: String,
        expr: Option<Expr>,
    },
    /// Typed address — no `String` round-trip (AUDIT A-9). The clear
    /// path's producers (`Workbook::clear_range`'s sparse scan, the
    /// public `clear_cell` after its own parse) always hold a
    /// `CellAddress` already, and the sheet-side replay has a typed
    /// entry (`BulkLoader::set_cell_at`), so carrying a string here
    /// meant one alloc + two parses per cleared cell in a bulk path.
    ClearCell { addr: CellAddress },
}

/// In-progress workbook bulk-load session. Buffers operations until
/// `flush` runs at the end of `Workbook::bulk_load`. Inside the closure
/// callers see synchronous returns from `set_formula` (parse / cycle
/// outcome decided here at queue time). Store propagation is consolidated by
/// each sheet's batch replay.
pub struct WorkbookLoader<'a> {
    wb: &'a mut Workbook,
    /// Per-sheet ordered op queues so the replay inside each sheet's
    /// `Sheet::bulk_load` preserves the caller's order.
    ops_by_sheet: HashMap<usize, Vec<WorkbookOp>>,
}

impl<'a> WorkbookLoader<'a> {
    pub(crate) fn new(wb: &'a mut Workbook) -> Self {
        WorkbookLoader {
            wb,
            ops_by_sheet: HashMap::new(),
        }
    }

    /// Queue a primitive write at `(sheet_idx, addr)`. Parses the address once
    /// here; the buffered op carries it typed.
    pub fn set_cell(&mut self, sheet_idx: usize, addr_str: &str, value: Value) {
        let Some(addr) = CellAddress::parse(addr_str) else {
            return;
        };
        self.set_cell_at(sheet_idx, addr, value);
    }

    /// Typed-address twin of `set_cell` (A-9 follow-up). Bulk producers
    /// that already hold a `CellAddress` — the wasm `restore_sparse` /
    /// `bulk_import_cells` decoders — skip the `to_string_repr` →
    /// re-parse round trip entirely.
    pub fn set_cell_at(&mut self, sheet_idx: usize, addr: CellAddress, value: Value) {
        if self.wb.is_inside_custom_call() {
            return; // re-entrancy guard (Wave 8)
        }
        if sheet_idx >= self.wb.sheets.len() {
            return;
        }
        self.ops_by_sheet
            .entry(sheet_idx)
            .or_default()
            .push(WorkbookOp::SetCell { addr, value });
    }

    /// Queue a formula write at `(sheet_idx, addr)`. Returns `false` if
    /// either the text fails to parse or the workbook static cycle check
    /// rejects it. Pending formulas in the same batch are additionally covered
    /// by the Store's runtime in-flight cycle guard.
    pub fn set_formula(&mut self, sheet_idx: usize, addr_str: &str, source: &str) -> bool {
        let Some(addr) = CellAddress::parse(addr_str) else {
            return false;
        };
        self.set_formula_at(sheet_idx, addr, source)
    }

    /// Typed-address twin of `set_formula` (A-9 follow-up) — same
    /// contract, same queue path, no address re-parse.
    pub fn set_formula_at(&mut self, sheet_idx: usize, addr: CellAddress, source: &str) -> bool {
        if self.wb.is_inside_custom_call() {
            return false; // re-entrancy guard (Wave 8)
        }
        if sheet_idx >= self.wb.sheets.len() {
            return false;
        }

        // Parse failure still records a SetFormula op so the sheet flush writes
        // `#VALUE!` through the normal formula API.
        let Some(expr) = parse_formula(source) else {
            self.ops_by_sheet
                .entry(sheet_idx)
                .or_default()
                .push(WorkbookOp::SetFormula {
                    addr,
                    source: source.to_string(),
                    expr: None,
                });
            return false;
        };

        if self.wb.closes_workbook_cycle(sheet_idx, addr, &expr) {
            self.ops_by_sheet
                .entry(sheet_idx)
                .or_default()
                .push(WorkbookOp::SetCell {
                    addr,
                    value: Value::Error(ValueError::CyclicRef),
                });
            return false;
        }
        self.ops_by_sheet
            .entry(sheet_idx)
            .or_default()
            .push(WorkbookOp::SetFormula {
                addr,
                source: source.to_string(),
                expr: Some(expr),
            });

        true
    }

    /// Queue a clear (=write to Null) at `(sheet_idx, addr)`.
    pub fn clear_cell(&mut self, sheet_idx: usize, addr_str: &str) {
        let Some(addr) = CellAddress::parse(addr_str) else {
            return;
        };
        self.clear_cell_at(sheet_idx, addr);
    }

    /// Typed-address twin of `clear_cell` (AUDIT A-9). Bulk callers that
    /// already hold a `CellAddress` — `Workbook::clear_range`'s sparse
    /// scan — skip the `to_string` → re-parse round trip entirely.
    pub fn clear_cell_at(&mut self, sheet_idx: usize, addr: CellAddress) {
        if self.wb.is_inside_custom_call() {
            return; // re-entrancy guard (Wave 8)
        }
        if sheet_idx >= self.wb.sheets.len() {
            return;
        }
        self.ops_by_sheet
            .entry(sheet_idx)
            .or_default()
            .push(WorkbookOp::ClearCell { addr });
    }

    /// Replay queued ops sheet-by-sheet inside each sheet's Store batch.
    ///
    /// 每张表回放完还要补一条**投影尾**。`Sheet::bulk_load` 走的是懒加载：
    /// 公式只把源码停进 `formula_source`，既不解析也不求值，于是新落地的
    /// 动态数组公式**没有任何 Store 边**能被 `BulkLoader::flush` 的反向依赖
    /// 扫描选中（那条扫描找的是"依赖被写地址的公式"，公式自己不是自己的
    /// 依赖方）。结果就是数组只剩 anchor 一个值，其余目标格空着 —— 而这条
    /// 路正是粘贴（`bulk_import_cells`）与 undo（`restore_sparse`）走的路。
    ///
    /// 补法与全表替换那条路（`bulk_install_storage` 尾部的
    /// `install_bulk_spill_projections`）收敛到同一个
    /// `Sheet::project_bulk_spill_anchors`。差别只在候选怎么选：那边扫停放
    /// 源码做字节筛，这边不必 —— workbook 侧为跨表环检查**已经**解析过每条
    /// 排队公式，直接拿 AST 问 `expr_may_produce_array`，零重复解析。
    /// `expr` 为 `None` 的是解析失败分支，不可能产出数组。
    ///
    /// 顺序：投影必须在整批回放**之后**。同一批里的一个字面量可能正好落在
    /// 另一条公式的溢出矩形里，先投影会让碰撞判定看到半个世界。
    pub(crate) fn flush(self) {
        let WorkbookLoader { wb, ops_by_sheet } = self;

        for (sheet_idx, ops) in ops_by_sheet {
            let Some(sheet) = wb.sheets.get_mut(sheet_idx) else {
                continue;
            };
            let mut spill_anchors: Vec<CellAddress> = Vec::new();
            // Pre-grow the per-sheet formula HashMaps to the known
            // batch size. Saves ~log2(N) rehashes during the replay
            // loop below (each rehash is O(current entries), so they
            // amortize to ~2× the final size in wasted copies on a
            // cold start).
            sheet.reserve_for_bulk_install(ops.len());
            sheet.bulk_load(|loader| {
                for op in ops {
                    match op {
                        WorkbookOp::SetCell { addr, value } => {
                            loader.set_cell_at(addr, value);
                        }
                        WorkbookOp::SetFormula { addr, source, expr } => {
                            // Hand the pre-parsed AST through when we
                            // have one — skips the sheet-loader's
                            // re-parse (the same AST was just produced
                            // by the workbook-side cycle check).
                            //
                            // `expr=None` is the parse-failure path:
                            // the source was unparseable on the
                            // workbook side too, so route through the
                            // string form and let the sheet writer
                            // produce `#VALUE!` via its own parse-fail
                            // arm (consistency: same `#VALUE!` error
                            // payload either way).
                            //
                            // Cross-sheet cycle was already handled by
                            // the `set_formula` queue path inserting a
                            // follow-up `SetCell` to override with
                            // `Value::Error(CyclicRef)`.
                            match expr {
                                Some(expr) => {
                                    // 投影候选就在这里挑：AST 已在手，
                                    // 问一次就够，不用回头扫源码。
                                    if expr_may_produce_array(&expr) {
                                        spill_anchors.push(addr);
                                    }
                                    // Move `source` so the sheet loader
                                    // stores the original allocation
                                    // instead of cloning.
                                    loader.set_formula_pre_parsed(addr, expr, source);
                                }
                                None => {
                                    loader.set_formula_at(addr, &source);
                                }
                            }
                        }
                        WorkbookOp::ClearCell { addr } => {
                            loader.set_cell_at(addr, Value::Null);
                        }
                    }
                }
            });
            sheet.project_bulk_spill_anchors(spill_anchors);
        }
    }
}
