//! 稀疏区域 facade 的几何依赖与成员读取。

use super::*;

impl FacadeCtx {
    pub(super) fn range_band_epoch_of(&self, key: RangeBandKey) -> AtomId {
        self.range_band_epoch_family
            .borrow_mut()
            .get_or_create(key, || self.owned_create_atom(Value::Null))
    }

    pub(super) fn range_column_epoch_of(&self, key: RangeColumnKey) -> AtomId {
        self.range_column_epoch_family
            .borrow_mut()
            .get_or_create(key, || self.owned_create_atom(Value::Null))
    }

    pub(super) fn range_sheet_epoch(&self) -> AtomId {
        self.range_sheet_epoch_family
            .borrow_mut()
            .get_or_create((), || self.owned_create_atom(Value::Null))
    }

    pub(super) fn depend_range_geometry_epochs(&self, range: CellRange, args: &ReadArgs) {
        let range = range.normalize();
        if range_cell_count_u64(range) <= RANGE_TIER_A_CELL_LIMIT {
            return;
        }

        let bounds = range_geometry_bounds(range);

        if range_band_count_u64(range) <= RANGE_BAND_DEP_LIMIT {
            let start_band = range_row_band(bounds.start_row);
            let end_band = range_row_band(bounds.end_row);
            for col in bounds.start_col..=bounds.end_col {
                for row_band in start_band..=end_band {
                    args.depend(self.range_band_epoch_of(RangeBandKey { col, row_band }));
                }
            }
            return;
        }

        let cols = inclusive_span_u64(bounds.start_col, bounds.end_col);
        if cols <= RANGE_COLUMN_DEP_LIMIT {
            for col in bounds.start_col..=bounds.end_col {
                args.depend(self.range_column_epoch_of(RangeColumnKey { col }));
            }
            return;
        }

        args.depend(self.range_sheet_epoch());
    }

    /// Formula-inner read body: evaluate `addr`'s formula under an on-stack
    /// [`AtomFormulaProvider`] whose ref/range lookups resolve through the
    /// facade family, so every cell the formula reads becomes a store
    /// dependency edge on THIS inner atom. The runtime cycle guard (codex F1)
    /// is armed by pushing `addr` onto the shared `in_flight` set via
    /// [`InFlightGuard`] for the duration of the eval.
    /// Row-major snapshot of the addresses inside `range` carrying a primitive
    /// or formula value — the `&Sheet`-free twin of
    /// [`Sheet::for_each_sparse_cell_with`]'s address collection. All `interior`
    /// borrows drop before returning, so the caller can read facades
    /// reactively without holding a borrow across a `store` read (D7).
    /// Tier-A ranges track every member facade; larger ranges track geometry
    /// epochs and use this sparse snapshot only for current values.
    ///
    /// # 「Row-major」指的是坐标，不是存储分桶
    ///
    /// 字面量格与公式格住在两张分开的稀疏表里，两张表各自升序 —— 但「先发完
    /// 字面量、再发公式」拼出来的序列不是行主序，混了两类格子的区域会把公式格
    /// 甩到最后（`=SEQUENCE(3)` 铺出的 A1:A3 发成 A2、A3、A1）。区域的遍历顺序
    /// 是**几何事实**，所以这里把两条升序序列按坐标**归并**，而不是给 spill
    /// 锚点开特例把它挪到前面。
    /// 见 `excel/rust/excel-core/tests/range_materialization_order.rs`。

    pub(super) fn range_member_addrs(&self, range: CellRange) -> Vec<CellAddress> {
        let primitive_addrs: Vec<CellAddress> = {
            let cells = self.interior.cells.borrow();
            cells
                .range_iter(range)
                .map(|(addr, _)| addr)
                .filter(|addr| {
                    !self.interior.formula_cells.borrow().contains_key(addr)
                        && !self.interior.formula_source.borrow().contains_key(addr)
                })
                .collect()
        };
        // `primitive_slot_has_visible_value` 会读 store，必须在 `cells` 借用
        // 释放之后再滤。滤完仍是升序。
        let primitives: Vec<CellAddress> = primitive_addrs
            .into_iter()
            .filter(|addr| self.primitive_slot_has_visible_value(*addr))
            .collect();
        merge_row_major(primitives, formula_addrs_in_range(&self.interior, range))
    }

    /// Primitive Null atoms may remain alive as Store dependency anchors after
    /// a clear. They are internal state, not sparse worksheet members.
    pub(super) fn primitive_slot_has_visible_value(&self, addr: CellAddress) -> bool {
        let probe: Result<Value, AtomId> = {
            let cells = self.interior.cells.borrow();
            match cells.get(&addr) {
                Some(CellSlot::Plain(value)) => Ok(value.clone()),
                Some(CellSlot::Atom(id)) => Err(*id),
                None => return false,
            }
        };
        let value = match probe {
            Ok(value) => value,
            Err(id) if self.store.has_atom(id) => self.store.get(id),
            Err(_) => Value::Null,
        };
        !matches!(value, Value::Null)
    }
}
