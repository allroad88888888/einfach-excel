//! 按稀疏结构遍历非空单元格。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// 区域内所有**公式格**地址，行主序（先行后列）升序。
///
/// 一条公式要么已 hydrate 落在 `formula_cells`，要么还躺在 `formula_source`
/// （LAZY_FORMULA_INDEXING 的共存不变式保证互斥），两张表各自升序，这里把它们
/// 归并成一条。区域物化的两个入口（[`FacadeCtx::range_member_addrs`] 与
/// [`Sheet::for_each_sparse_cell_with`]）共用它，避免两处各写一遍归并再漂移。
pub(super) fn formula_addrs_in_range(interior: &SheetInterior, range: CellRange) -> Vec<CellAddress> {
    let cells = interior.formula_cells.borrow();
    let source = interior.formula_source.borrow();
    let mut out: Vec<CellAddress> = Vec::with_capacity(cells.len() + source.len());
    let mut hydrated = cells.range_iter(range).map(|(addr, _)| addr).peekable();
    let mut lazy = source.range_iter(range).map(|(addr, _)| addr).peekable();
    loop {
        match (hydrated.peek().copied(), lazy.peek().copied()) {
            (None, None) => break,
            (Some(x), None) => {
                out.push(x);
                hydrated.next();
            }
            (None, Some(y)) => {
                out.push(y);
                lazy.next();
            }
            (Some(x), Some(y)) => {
                let (xk, yk) = ((x.row, x.col), (y.row, y.col));
                if xk == yk {
                    // 共存不变式说这不该发生，防御性地折叠成一个，免得重复
                    // 发射打穿「地址两两不同」的调用方假设。
                    out.push(x);
                    hydrated.next();
                    lazy.next();
                } else if xk < yk {
                    out.push(x);
                    hydrated.next();
                } else {
                    out.push(y);
                    lazy.next();
                }
            }
        }
    }
    out
}

/// 把两条各自行主序升序的地址序列归并成一条行主序升序序列。相等坐标时先给
/// `primitives` —— 调用方要么已把被公式遮蔽的字面量滤掉，要么会跳过它。
pub(super) fn merge_row_major(primitives: Vec<CellAddress>, formulas: Vec<CellAddress>) -> Vec<CellAddress> {
    let mut out: Vec<CellAddress> = Vec::with_capacity(primitives.len() + formulas.len());
    let mut prims = primitives.into_iter().peekable();
    let mut forms = formulas.into_iter().peekable();
    loop {
        let take_prim = match (prims.peek(), forms.peek()) {
            (None, None) => break,
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (Some(p), Some(q)) => (p.row, p.col) <= (q.row, q.col),
        };
        let next = if take_prim { prims.next() } else { forms.next() };
        out.push(next.expect("peek 已确认非空"));
    }
    out
}

impl Sheet {
    /// Sparse iteration over this sheet's cells inside `range`.
    /// `value_resolver` is called for each present address; for primitive
    /// cells we read the store directly, for formula cells we route
    /// through `value_resolver` so the caller can pass its own provider
    /// (so cross-sheet formula deps still resolve correctly when called
    /// from `WorkbookEvalProvider`). Used as the building block for
    /// `SheetEvalProvider::for_each_range_cell` and the Workbook variant.
    ///
    /// Phase 2 Track F: visits O(cells_in_range) instead of
    /// O(total non-empty). Both `cells` and `formula_cells` are
    /// row-major BTreeMaps, so `range_iter` is a pair of BTreeMap
    /// `range(min..=max)` calls — no filter sweep over the whole
    /// sheet. At 1M scattered non-empty cells, a 50×27 viewport read
    /// visits at most 50 rows × 27 cols, not 1M.
    ///
    /// # 发射顺序是行主序坐标，不是存储分桶
    ///
    /// 字面量格住 `interior.cells`，公式格住 `formula_cells` / `formula_source`。
    /// 两张表**各自**升序，但「先发完字面量表、再发公式表」拼出来的序列不是
    /// 行主序 —— 任何混了两类格子的区域，公式格都会被甩到最后。顺序敏感的
    /// 消费者（`MATCH` / `XMATCH` / `CONCAT` / `CONCATENATE` / `TEXTJOIN` /
    /// `NPV` / `SERIESSUM` / `XIRR` 等走 `for_each_arg_value` 的那一支）直接
    /// 吃这个顺序，于是 `=SEQUENCE(3)` 铺出的 A1:A3 会答 `MATCH(2,…,0)=1`、
    /// `CONCAT=231`。区域的遍历顺序是**几何事实**，所以下面把两个升序序列
    /// **归并**成一条按 `(row, col)` 升序的序列再发，而不是给 spill 锚点开
    /// 特例把它挪到前面。契约测试见
    /// `excel/rust/excel-core/tests/range_materialization_order.rs`。
    pub(crate) fn for_each_sparse_cell_with(
        &self,
        range: CellRange,
        value_resolver: &dyn Fn(&Sheet, CellAddress) -> Value,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        // LAZY_FORMULA_INDEXING Phase 3: snapshot the formula address
        // sets up front. Both `formula_cells` and `formula_source` may
        // grow during iteration (hydration moves entries from the
        // latter to the former), and the `BTreeMap::range` iterators
        // hold a borrow that conflicts with the `borrow_mut` inside
        // hydration. Collecting addresses first releases the borrows
        // and gives us a stable iteration set.
        let formula_addrs = formula_addrs_in_range(&self.interior, range);

        // P4a borrow rule: snapshot the primitive addresses in range so no
        // `cells` borrow is held across `cell_value_at` (store read) or the
        // caller's `f`. Membership can't change during the loop (`&self`),
        // so the per-iteration formula-map checks below observe the same
        // set the live iteration did.
        let prim_addrs: Vec<CellAddress> = self
            .interior
            .cells
            .borrow()
            .range_iter(range)
            .map(|(addr, _)| addr)
            .collect();
        // 行主序归并：`prim_addrs` 与 `formula_addrs` 各自升序，按 `(row, col)`
        // 交错取小的那个，合成一条全局行主序的发射序列。两个快照都在循环前取好，
        // 所以 `value_resolver` 里的惰性 hydration（把条目从 `formula_source`
        // 搬进 `formula_cells`）不会动到迭代集合。
        let mut prims = prim_addrs.into_iter().peekable();
        let mut formulas = formula_addrs.into_iter().peekable();
        loop {
            let take_prim = match (prims.peek(), formulas.peek()) {
                (None, None) => break,
                (Some(_), None) => true,
                (None, Some(_)) => false,
                // 同坐标时先取字面量：它会被下面的「已升级成公式」判断跳过，
                // 下一轮再由公式分支在同一坐标发出值。
                (Some(p), Some(q)) => (p.row, p.col) <= (q.row, q.col),
            };
            if take_prim {
                let addr = prims.next().expect("peek 已确认非空");
                // Skip primitives that have been upgraded to formulas — the
                // formula branch emits the formula value at this addr.
                // Address-equality check stays O(1) (BTreeMap point lookup).
                // Both hydrated and lazy formulas count.
                if self.interior.formula_cells.borrow().contains_key(&addr)
                    || self.interior.formula_source.borrow().contains_key(&addr)
                {
                    continue;
                }
                let Some(value) = self.cell_value_at(addr) else {
                    continue;
                };
                if matches!(value, Value::Null) {
                    continue;
                }
                f(addr, value);
            } else {
                let addr = formulas.next().expect("peek 已确认非空");
                let v = value_resolver(self, addr);
                f(addr, v);
            }
        }
    }

    /// Iterate every address that has a primitive value or a formula. Empty
    /// addresses are skipped. Used by structural-undo to snapshot only the
    /// cells that actually need restoring (see `excel/solid-excel/docs/STRUCTURAL_UNDO.md`).
    ///
    /// An address can appear in both `cells` and `formula_cells` during the
    /// brief Computing window when a formula write created a primitive slot
    /// that was then upgraded; the formula entry dominates, so we union the
    /// keys and skip duplicates.
    ///
    /// Both backing maps iterate row-major ascending (row, then col), so
    /// the formula keys come out row-major first, followed by the
    /// primitive-only keys row-major. Callers that need the union in
    /// global row-major order (e.g. undo snapshot) must sort the result;
    /// today's `non_empty_addrs` callers either don't care about order or
    /// re-sort explicitly (verified in the `non_empty_addrs_*` tests),
    /// so this two-pass walk preserves the prior HashMap-era contract
    /// without changing observable behavior.
    pub fn for_each_non_empty(&self, mut f: impl FnMut(CellAddress)) {
        // LAZY_FORMULA_INDEXING Phase 3: snapshot addresses up front so
        // the inner closure can hydrate / mutate without conflicting
        // borrows. Iteration covers hydrated formulas AND lazy parked
        // formulas — both are "non-empty" from the snapshot caller's
        // POV.
        let formula_addrs: Vec<CellAddress> = {
            let cells = self.interior.formula_cells.borrow();
            let source = self.interior.formula_source.borrow();
            let mut out: Vec<CellAddress> = Vec::with_capacity(cells.len() + source.len());
            out.extend(cells.iter().map(|(a, _)| a));
            for (a, _) in source.iter() {
                if !cells.contains_key(&a) {
                    out.push(a);
                }
            }
            out
        };
        for addr in formula_addrs {
            f(addr);
        }
        // Snapshot the formula key set once so the inner closure cost
        // doesn't pay a per-cell `RefCell::borrow`.
        let formula_keys: HashSet<CellAddress> = {
            let cells = self.interior.formula_cells.borrow();
            let source = self.interior.formula_source.borrow();
            cells.keys().chain(source.keys()).collect()
        };
        // P4a borrow rule: snapshot the primitive keys so no `cells`
        // borrow is held across the caller's `f` (row-major order kept).
        let prim_addrs: Vec<CellAddress> = self.interior.cells.borrow().keys().collect();
        for addr in prim_addrs {
            if formula_keys.contains(&addr) || !self.primitive_slot_has_visible_value(addr) {
                continue;
            }
            f(addr);
        }
    }

    /// Iterate every non-empty address inside `range` without reading cell
    /// values. Formula entries are reported by address only, so this does
    /// not evaluate or materialize Store-derived formula values.
    pub fn for_each_non_empty_in_range(&self, range: CellRange, mut f: impl FnMut(CellAddress)) {
        // LAZY_FORMULA_INDEXING Phase 3: same snapshot pattern as
        // `for_each_non_empty`.
        let formula_addrs: Vec<CellAddress> = {
            let cells = self.interior.formula_cells.borrow();
            let source = self.interior.formula_source.borrow();
            let mut out: Vec<CellAddress> = Vec::new();
            out.extend(cells.range_iter(range).map(|(a, _)| a));
            for (a, _) in source.range_iter(range) {
                if !cells.contains_key(&a) {
                    out.push(a);
                }
            }
            out
        };
        for addr in formula_addrs {
            f(addr);
        }
        // AUDIT A-3: dedup per visited address (two map probes per cell
        // actually inside the range) instead of materializing a HashSet
        // over the ENTIRE sheet's formula key space — the global
        // snapshot made a one-cell `clear_range` O(total formulas).
        // Borrows are taken per iteration so `f` stays free to re-enter
        // sheet state, matching the old snapshot pattern's guarantees.
        // P4a borrow rule: the in-range primitive keys are snapshotted
        // first so no `cells` borrow is held across `f`.
        let prim_addrs: Vec<CellAddress> = self
            .interior
            .cells
            .borrow()
            .range_iter(range)
            .map(|(addr, _)| addr)
            .collect();
        for addr in prim_addrs {
            if self.interior.formula_cells.borrow().contains_key(&addr)
                || self.interior.formula_source.borrow().contains_key(&addr)
                || !self.primitive_slot_has_visible_value(addr)
            {
                continue;
            }
            f(addr);
        }
    }

    /// Collect every non-empty address as an `"A1"`-style string. Cheap
    /// convenience wrapper around `for_each_non_empty` for wasm exposure.
    pub fn non_empty_addrs(&self) -> Vec<String> {
        let mut out = Vec::with_capacity(
            self.interior.formula_cells.borrow().len()
                + self.interior.formula_source.borrow().len()
                + self.interior.cells.borrow().len(),
        );
        self.for_each_non_empty(|addr| out.push(addr.to_string()));
        out
    }
}
