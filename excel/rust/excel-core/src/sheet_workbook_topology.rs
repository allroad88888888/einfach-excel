//! 本表在工作簿里的位置随增删表而重映射。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// Workbook-scoped inputs consumed by formula-inner atoms. The three version
/// atoms are ordinary Store primitives: formulas depend on them only when they
/// read topology, names, or custom functions. Cell/range dependencies still
/// point directly at target facades in the same shared Store.
/// Read-only projection of one workbook Table into the atom context
/// (design doc #32 §5.3). The formula-inner provider resolves structured
/// references against this snapshot without a back-reference to `Workbook`,
/// mirroring how defined names project through `WorkbookAtomContext::names`.
/// Refreshed wholesale by `sync_tables` on every registry mutation.
#[derive(Clone)]
pub(crate) struct ProjectedTable {
    pub(crate) sheet_name: String,
    pub(crate) range: CellRange,
    pub(crate) has_headers: bool,
    pub(crate) has_totals: bool,
    pub(crate) columns: Vec<String>,
}

impl ProjectedTable {
    pub(super) fn to_resolved(&self, sheet_index: usize) -> ResolvedTable {
        ResolvedTable {
            sheet_name: self.sheet_name.clone(),
            sheet_index,
            range: self.range,
            has_headers: self.has_headers,
            has_totals: self.has_totals,
            columns: self.columns.clone(),
        }
    }
}

pub(super) struct WorkbookAtomTopology {
    pub(super) sheets: Vec<(String, FacadeCtx)>,
    pub(super) by_name: HashMap<String, usize>,
}

/// Where the sheet at `idx` ends up after a sheet moves `from` → `to`.
///
/// Mirrors the wasm layer's identically-named helper, which remaps subscription
/// tokens across the same rotation. Both exist because sheet ORDER is the
/// engine's only sheet identity — there is no stable sheet id — so every piece
/// of index-keyed side state has to ride the rotation explicitly.
pub(super) fn remap_sheet_index_after_move(idx: usize, from: usize, to: usize) -> usize {
    if from == to {
        return idx;
    }
    if idx == from {
        return to;
    }
    if from < to && idx > from && idx <= to {
        return idx - 1;
    }
    if to < from && idx >= to && idx < from {
        return idx + 1;
    }
    idx
}

/// Rebuild an index-keyed hidden-row store under `remap`, dropping entries the
/// closure maps to `None`. Returns whether anything actually moved or was
/// dropped, so the caller can skip a redundant epoch bump.
pub(super) fn remap_index_keyed_rows(
    store: &RefCell<HashMap<usize, Rc<HashSet<u32>>>>,
    remap: impl Fn(usize) -> Option<usize>,
) -> bool {
    let mut map = store.borrow_mut();
    if map.is_empty() {
        return false;
    }
    let mut changed = false;
    let mut next: HashMap<usize, Rc<HashSet<u32>>> = HashMap::with_capacity(map.len());
    for (key, rows) in map.drain() {
        match remap(key) {
            Some(new_key) => {
                changed |= new_key != key;
                next.insert(new_key, rows);
            }
            // Dropped: the owning sheet is gone.
            None => changed = true,
        }
    }
    *map = next;
    changed
}

/// Displace the ROW numbers inside ONE sheet's entry of an index-keyed
/// hidden-row store, via [`shift_hidden_row`].
///
/// Sibling of `remap_index_keyed_rows` above on the other axis: that one
/// rewrites the map's KEYS (sheet indices) after a sheet reorder, this one
/// rewrites a single entry's VALUES after a row insert/delete on that sheet.
///
/// Emptying out drops the entry rather than storing an empty set, upholding
/// the store's "a lookup miss and an empty set are the same no-filtering
/// signal" contract. Returns true only when the set actually changed, so the
/// caller can skip an epoch bump that would dirty SUBTOTAL formulas for
/// nothing (a `count` of 0, or an edit entirely below every hidden row).
pub(super) fn shift_rows_for_sheet(
    store: &RefCell<HashMap<usize, Rc<HashSet<u32>>>>,
    sheet_index: usize,
    at: u32,
    count: u32,
    insert: bool,
) -> bool {
    let mut map = store.borrow_mut();
    let Some(rows) = map.get(&sheet_index).cloned() else {
        return false;
    };
    let mut next: HashSet<u32> = HashSet::with_capacity(rows.len());
    for &row in rows.iter() {
        if let Some(moved) = shift_hidden_row(row, at, count, insert) {
            next.insert(moved);
        }
    }
    // Set equality: same cardinality plus containment. A no-op edit must not
    // bump the epoch.
    if next.len() == rows.len() && next.iter().all(|row| rows.contains(row)) {
        return false;
    }
    if next.is_empty() {
        map.remove(&sheet_index);
    } else {
        map.insert(sheet_index, Rc::new(next));
    }
    true
}
