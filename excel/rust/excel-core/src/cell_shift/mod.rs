//! 插入/删除单元格（局部位移）：所选矩形向右/向下插入空格，或删除后左移/上移。
//!
//! | 子模块 | 负责 |
//! |---|---|
//! | `mod`（本文件） | 位移几何：方向、正交带、受影响矩形与单格映射；历史条目的数据形状 |
//! | `preflight` | Excel 拒绝的情形：合并格、Table、溢出数组、筛选、保护与推出画布 |
//! | `prepare` | 一次性生成前后像：带内内容、带外公式、条件格式、验证、名称 |
//! | `validation` | 本表自定义公式验证的锚点与公式随位移改写 |
//! | `apply` | 校验当前状态后在一个 Store batch 内安装某一侧的前后像 |
//!
//! 首次执行与重做走同一条 `apply(undo = false)` 路径，撤销安装前像。
use super::workbook_formula_lambda_change::FormulaLambdaChange;
use super::workbook_formula_rule_change::FormulaRuleChange;
use super::workbook_formula_source_change::FormulaSourceChange;
use super::*;
use crate::data_validation::DataValidationRegion;
use crate::history_snapshot::HistorySnapshot;
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::shift::ShiftEdit;

mod apply;
mod preflight;
mod prepare;
mod validation;
#[cfg(test)]
mod tests;

/// 插入单元格向右/向下推开原内容；删除单元格让右侧/下方内容左移/上移补位。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CellShiftDirection {
    InsertRight,
    InsertDown,
    DeleteLeft,
    DeleteUp,
}

impl CellShiftDirection {
    pub fn label(self) -> &'static str {
        match self {
            Self::InsertRight | Self::InsertDown => "Insert cells",
            Self::DeleteLeft | Self::DeleteUp => "Delete cells",
        }
    }
}

/// 一次局部位移的几何：位移轴上的插删编辑，加上正交轴的带。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct CellShift {
    pub(crate) selection: CellRange,
    pub(crate) edit: ShiftEdit,
    /// 正交轴闭区间：左右位移为行带，上下位移为列带。
    pub(crate) band: (u32, u32),
}

impl CellShift {
    pub(crate) fn new(selection: CellRange, direction: CellShiftDirection) -> Self {
        let selection = selection.normalize();
        let (rows, cols) = (selection.rows(), selection.cols());
        let (s, e) = (selection.start, selection.end);
        let (edit, band) = match direction {
            CellShiftDirection::InsertRight => {
                (ShiftEdit::ColInsert { at: s.col, count: cols }, (s.row, e.row))
            }
            CellShiftDirection::DeleteLeft => {
                (ShiftEdit::ColDelete { at: s.col, count: cols }, (s.row, e.row))
            }
            CellShiftDirection::InsertDown => {
                (ShiftEdit::RowInsert { at: s.row, count: rows }, (s.col, e.col))
            }
            CellShiftDirection::DeleteUp => {
                (ShiftEdit::RowDelete { at: s.row, count: rows }, (s.col, e.col))
            }
        };
        Self { selection, edit, band }
    }

    pub(crate) fn is_insert(&self) -> bool {
        matches!(self.edit, ShiftEdit::RowInsert { .. } | ShiftEdit::ColInsert { .. })
    }

    fn limit(&self) -> u32 {
        if self.edit.is_row_edit() { EXCEL_MAX_ROWS } else { EXCEL_MAX_COLS }
    }

    fn count(&self) -> u32 {
        match self.edit {
            ShiftEdit::RowInsert { count, .. }
            | ShiftEdit::RowDelete { count, .. }
            | ShiftEdit::ColInsert { count, .. }
            | ShiftEdit::ColDelete { count, .. } => count,
        }
    }

    /// 会移动或消失的全部单元格：带内从所选起点直到画布末端。
    pub(crate) fn area(&self) -> CellRange {
        let s = self.selection.start;
        if self.edit.is_row_edit() {
            CellRange::new(s, CellAddress::new(EXCEL_MAX_ROWS - 1, self.band.1))
        } else {
            CellRange::new(s, CellAddress::new(self.band.1, EXCEL_MAX_COLS - 1))
        }
    }

    /// 插入时被推出画布的尾部；删除时就是被删除的所选矩形。
    pub(crate) fn vanishing(&self) -> CellRange {
        if !self.is_insert() {
            return self.selection;
        }
        let area = self.area();
        let first = self.limit() - self.count();
        if self.edit.is_row_edit() {
            CellRange::new(CellAddress::new(first, area.start.col), area.end)
        } else {
            CellRange::new(CellAddress::new(area.start.row, first), area.end)
        }
    }

    /// `area` 内单格的新位置；被删除或被推出画布时返回 None。
    pub(crate) fn map(&self, addr: CellAddress) -> Option<CellAddress> {
        if !self.area().contains(addr) {
            return Some(addr);
        }
        if self.vanishing().contains(addr) {
            return None;
        }
        let count = self.count();
        let insert = self.is_insert();
        let shift = |value: u32| if insert { value + count } else { value - count };
        Some(if self.edit.is_row_edit() {
            CellAddress::new(shift(addr.row), addr.col)
        } else {
            CellAddress::new(addr.row, shift(addr.col))
        })
    }

    /// 整块矩形随位移：完全在 `area` 内才平移，删除区内的矩形消失。
    pub(crate) fn map_rect(&self, range: CellRange) -> Option<CellRange> {
        Some(CellRange::new(self.map(range.start)?, self.map(range.end)?))
    }
}

/// 一条插入/删除单元格历史：带内稀疏前后像加上带外真正改写的引用。
#[derive(Debug)]
pub(crate) struct CellShiftChange {
    pub(crate) sheet: usize,
    pub(crate) shift: CellShift,
    sheet_key: u64,
    cells: (HistorySnapshot, HistorySnapshot),
    formulas: Vec<FormulaSourceChange>,
    rules: Vec<FormulaRuleChange>,
    lambdas: Vec<FormulaLambdaChange>,
    named_ranges: Vec<NamedRangeShift>,
    validations: (Vec<DataValidationRegion>, Vec<DataValidationRegion>),
}

impl CellShiftChange {
    pub(crate) fn affected_sheets(&self, workbook: &Workbook) -> Vec<usize> {
        let mut indices = BTreeSet::from([self.sheet]);
        indices.extend(self.formulas.iter().map(|formula| formula.sheet));
        indices.extend(self.rules.iter().filter_map(|rule| {
            workbook.sheet_keys.iter().position(|key| *key == rule.sheet_key)
        }));
        indices.into_iter().collect()
    }

    pub(crate) fn mutation_ranges(&self) -> Vec<(usize, Option<CellRange>)> {
        crate::host::changed_ranges(&self.cells.0, &self.cells.1)
            .into_iter()
            .map(|range| (self.sheet, Some(range)))
            .chain(self.formulas.iter().map(|change| (change.sheet, change.mutation_range())))
            .collect()
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.cells.0.retained_bytes()
            + self.cells.1.retained_bytes()
            + self.formulas.iter().map(FormulaSourceChange::retained_bytes).sum::<usize>()
            + crate::sheet::metadata_bytes(&self.rules)
            + crate::sheet::metadata_bytes(&self.lambdas)
            + self.named_ranges.iter().map(NamedRangeShift::retained_bytes).sum::<usize>()
            + crate::sheet::metadata_bytes(&self.validations)
    }
}
