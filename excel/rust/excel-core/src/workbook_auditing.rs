//! Workbook formula auditing suite:
//! - Trace Precedents (`trace_precedents`)
//! - Trace Dependents (`trace_dependents`)
//! - Evaluate Formula step-by-step (`evaluate_formula_steps`)
//! - Watch Window cell inspection (`inspect_watched_cells`)

use super::*;
use crate::auditing_eval::{collapse_top_left, evaluate_cell_formula_steps};
pub use crate::auditing_eval::{FormulaEvalStep, FormulaEvaluationTrace};

/// One precedent or dependent cell/range reference discovered by formula auditing.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuditingRef {
    pub sheet_index: usize,
    pub sheet_name: String,
    pub range: CellRange,
    pub is_error: bool,
}

/// Snapshot of a single watched cell for the Watch Window (监视窗口).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WatchedCellSnapshot {
    pub sheet_index: usize,
    pub sheet_name: String,
    pub addr: CellAddress,
    pub name: Option<String>,
    pub value: String,
    pub formula: String,
    pub is_error: bool,
}

impl Workbook {
    /// Return direct precedent cells/ranges referenced by the formula at `(sheet_index, addr)`.
    pub fn trace_precedents(&self, sheet_index: usize, addr: CellAddress) -> Vec<AuditingRef> {
        let Some(sheet) = self.sheets.get(sheet_index) else {
            return Vec::new();
        };
        let mut raw_refs: Vec<(usize, CellRange)> = Vec::new();
        if let Some(expr) = sheet.cycle_expr_for(addr) {
            let scoped = HashSet::new();
            let mut visiting = HashSet::new();
            self.collect_precedent_ranges(&expr, sheet_index, addr, &scoped, &mut visiting, &mut raw_refs);
        } else if let Some(anchor) = sheet.spill_anchor_for(addr) {
            raw_refs.push((sheet_index, CellRange::single(anchor)));
        }

        let source_is_error = self.auditing_cell_is_error(sheet_index, addr);
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        for (target_sheet_idx, range) in raw_refs {
            let norm = range.normalize();
            if !seen.insert((target_sheet_idx, norm)) {
                continue;
            }
            let Some(sheet_name) = self.names.get(target_sheet_idx).cloned() else {
                continue;
            };
            let is_error = source_is_error || self.auditing_range_has_error(target_sheet_idx, norm);
            out.push(AuditingRef { sheet_index: target_sheet_idx, sheet_name, range: norm, is_error });
        }
        out
    }

    /// Return direct formula cells in the workbook whose formula references `(sheet_index, addr)`.
    pub fn trace_dependents(&self, sheet_index: usize, addr: CellAddress) -> Vec<AuditingRef> {
        let Some(origin_sheet) = self.sheets.get(sheet_index) else {
            return Vec::new();
        };
        let target_rect = match origin_sheet.spill_info(addr) {
            Some((rows, cols)) if rows > 0 && cols > 0 => CellRange::new(
                addr,
                CellAddress::new(
                    addr.row.saturating_add(rows - 1).min(GRID_MAX_ROW),
                    addr.col.saturating_add(cols - 1).min(GRID_MAX_COL),
                ),
            ),
            _ => CellRange::single(addr),
        };

        let source_is_error = self.auditing_cell_is_error(sheet_index, addr);
        let full_range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(u32::MAX, u32::MAX));
        let mut out = Vec::new();

        for (dep_sheet_idx, dep_sheet) in self.sheets.iter().enumerate() {
            let Some(dep_sheet_name) = self.names.get(dep_sheet_idx).cloned() else {
                continue;
            };
            let mut formula_addrs: Vec<CellAddress> =
                dep_sheet.formula_addrs_in_range(full_range).into_iter().collect();
            formula_addrs.sort_by_key(|a| (a.row, a.col));

            for dep_addr in formula_addrs {
                if dep_sheet_idx == sheet_index && dep_addr == addr {
                    continue;
                }
                let Some(expr) = dep_sheet.cycle_expr_for(dep_addr) else {
                    continue;
                };
                let scoped = HashSet::new();
                let mut visiting = HashSet::new();
                let mut prec_ranges = Vec::new();
                self.collect_precedent_ranges(
                    &expr,
                    dep_sheet_idx,
                    dep_addr,
                    &scoped,
                    &mut visiting,
                    &mut prec_ranges,
                );
                if prec_ranges.iter().any(|(s_idx, r)| *s_idx == sheet_index && ranges_overlap(*r, target_rect)) {
                    let is_error = source_is_error || self.auditing_cell_is_error(dep_sheet_idx, dep_addr);
                    out.push(AuditingRef {
                        sheet_index: dep_sheet_idx,
                        sheet_name: dep_sheet_name.clone(),
                        range: CellRange::single(dep_addr),
                        is_error,
                    });
                }
            }
        }
        out
    }

    /// Produce step-by-step evaluation trace for the formula at `(sheet_index, addr)`.
    pub fn evaluate_formula_steps(&self, sheet_index: usize, addr: CellAddress) -> FormulaEvaluationTrace {
        evaluate_cell_formula_steps(self, sheet_index, addr)
    }

    /// Inspect watched cells across any worksheets for the Watch Window (监视窗口).
    pub fn inspect_watched_cells(&self, targets: &[(usize, CellAddress)]) -> Vec<WatchedCellSnapshot> {
        let mut out = Vec::with_capacity(targets.len());
        for &(sheet_index, addr) in targets {
            let Some(sheet_name) = self.names.get(sheet_index).cloned() else {
                continue;
            };
            let raw_val = self.get_cell(&sheet_name, &addr.to_string());
            let scalar = collapse_top_left(&raw_val);
            let value = crate::value_to_display(&scalar);
            let is_error = matches!(scalar, Value::Error(_));
            let formula = self.sheets.get(sheet_index).and_then(|s| s.formula_text_at(addr)).unwrap_or_default();
            let name = self.defined_name_for_cell(sheet_index, addr);
            out.push(WatchedCellSnapshot { sheet_index, sheet_name, addr, name, value, formula, is_error });
        }
        out
    }

    pub(crate) fn auditing_eval_provider(&self, sheet_index: usize, current_cell: Option<CellAddress>) -> WorkbookEvalProvider<'_> {
        WorkbookEvalProvider {
            wb: self,
            current: Cell::new(sheet_index),
            current_cell: Cell::new(current_cell),
        }
    }

    pub(crate) fn settle_auditing_reads(&self) {
        self.store.settle_pending_reads();
    }

    pub(crate) fn resolve_auditing_table_ref(
        &self,
        current_sheet_idx: usize,
        origin_addr: Option<CellAddress>,
        table: Option<&str>,
        area: TableArea,
        columns: Option<&(String, String)>,
    ) -> Option<(usize, CellRange)> {
        let entry = match table {
            Some(name) => self.tables.get(&name.to_ascii_uppercase())?,
            None => {
                let addr = origin_addr?;
                let sheet_name = self.names.get(current_sheet_idx)?;
                self.tables.values().find(|t| &t.sheet_name == sheet_name && t.range.contains(addr))?
            }
        };
        let table_sheet_idx = self.by_name.get(&entry.sheet_name).copied()?;
        let range = entry.to_resolved(table_sheet_idx).reference_range(area, columns, origin_addr).ok()?;
        Some((table_sheet_idx, range.normalize()))
    }

    fn defined_name_for_cell(&self, sheet_index: usize, addr: CellAddress) -> Option<String> {
        let sheet_key = *self.sheet_keys.get(sheet_index)?;
        let single = CellRange::single(addr);
        for entry in self.named_values.values() {
            if let NamedDefinition::Range { sheet_key: entry_key, range: Some(r) } = &entry.definition {
                if *entry_key == sheet_key && r.normalize() == single {
                    return Some(entry.canonical_name.clone());
                }
            }
        }
        None
    }

    fn auditing_cell_is_error(&self, sheet_index: usize, addr: CellAddress) -> bool {
        let Some(sheet_name) = self.names.get(sheet_index) else {
            return false;
        };
        matches!(collapse_top_left(&self.get_cell(sheet_name, &addr.to_string())), Value::Error(_))
    }

    fn auditing_range_has_error(&self, sheet_index: usize, range: CellRange) -> bool {
        let norm = range.normalize();
        if norm.start == norm.end {
            return self.auditing_cell_is_error(sheet_index, norm.start);
        }
        let mut found_error = false;
        self.for_each_sparse_range_cell(sheet_index, norm, |_, val| {
            if matches!(collapse_top_left(&val), Value::Error(_)) {
                found_error = true;
            }
        });
        found_error
    }

    fn collect_precedent_ranges(
        &self,
        expr: &Expr,
        current_sheet_idx: usize,
        origin_addr: CellAddress,
        scoped_names: &HashSet<String>,
        visiting_names: &mut HashSet<String>,
        out: &mut Vec<(usize, CellRange)>,
    ) {
        match expr {
            Expr::CellRef(addr, _) if addr.row <= GRID_MAX_ROW && addr.col <= GRID_MAX_COL => {
                out.push((current_sheet_idx, CellRange::single(*addr)));
            }
            Expr::Range { start, end, .. } => {
                out.push((current_sheet_idx, Self::clamp_grid_range(*start, *end)));
            }
            Expr::SheetRef { sheet, addr, .. } if addr.row <= GRID_MAX_ROW && addr.col <= GRID_MAX_COL => {
                if let Some(&target_idx) = self.by_name.get(sheet) {
                    out.push((target_idx, CellRange::single(*addr)));
                }
            }
            Expr::SheetRange { sheet, start, end, .. } => {
                if let Some(&target_idx) = self.by_name.get(sheet) {
                    out.push((target_idx, Self::clamp_grid_range(*start, *end)));
                }
            }
            Expr::SpillRef(inner) => {
                let target = match inner.as_ref() {
                    Expr::CellRef(a, _) => Some((current_sheet_idx, *a)),
                    Expr::SheetRef { sheet, addr, .. } => self.by_name.get(sheet).map(|&idx| (idx, *addr)),
                    _ => None,
                };
                if let Some((target_idx, anchor_addr)) = target {
                    let range = match self.sheets.get(target_idx).and_then(|s| s.spill_info(anchor_addr)) {
                        Some((rows, cols)) if rows > 0 && cols > 0 => CellRange::new(
                            anchor_addr,
                            CellAddress::new(
                                anchor_addr.row.saturating_add(rows - 1).min(GRID_MAX_ROW),
                                anchor_addr.col.saturating_add(cols - 1).min(GRID_MAX_COL),
                            ),
                        ),
                        _ => CellRange::single(anchor_addr),
                    };
                    out.push((target_idx, range));
                } else {
                    self.collect_precedent_ranges(inner, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
                }
            }
            Expr::Name(name) => {
                self.collect_named_precedents(name, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
            }
            Expr::TableRef { table, area, columns } => {
                if let Some(resolved) = self.resolve_auditing_table_ref(current_sheet_idx, Some(origin_addr), table.as_deref(), *area, columns.as_ref()) {
                    out.push(resolved);
                }
            }
            Expr::FuncCall { name, args } => {
                if name == "LET" && args.len() >= 3 && args.len() % 2 == 1 {
                    let mut scoped = scoped_names.clone();
                    for pair in args[..args.len() - 1].chunks_exact(2) {
                        self.collect_precedent_ranges(&pair[1], current_sheet_idx, origin_addr, &scoped, visiting_names, out);
                        if let Expr::Name(alias) = &pair[0] {
                            scoped.insert(alias.to_uppercase());
                        }
                    }
                    self.collect_precedent_ranges(args.last().unwrap(), current_sheet_idx, origin_addr, &scoped, visiting_names, out);
                    return;
                }
                if name == "LAMBDA" && !args.is_empty() {
                    let mut scoped = scoped_names.clone();
                    for param in &args[..args.len() - 1] {
                        if let Expr::Name(alias) = param {
                            scoped.insert(alias.to_uppercase());
                        }
                    }
                    self.collect_precedent_ranges(args.last().unwrap(), current_sheet_idx, origin_addr, &scoped, visiting_names, out);
                    return;
                }
                self.collect_named_precedents(name, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
                for arg in args {
                    self.collect_precedent_ranges(arg, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
                }
            }
            Expr::BinOp { left, right, .. } | Expr::DynamicRange { start: left, end: right } => {
                self.collect_precedent_ranges(left, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
                self.collect_precedent_ranges(right, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
            }
            Expr::Negate(inner) | Expr::Percent(inner) => {
                self.collect_precedent_ranges(inner, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
            }
            Expr::Call(callee, args) => {
                self.collect_precedent_ranges(callee, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
                for arg in args {
                    self.collect_precedent_ranges(arg, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
                }
            }
            Expr::ArrayLit { data, .. } | Expr::MultiArea(data) => {
                for item in data {
                    self.collect_precedent_ranges(item, current_sheet_idx, origin_addr, scoped_names, visiting_names, out);
                }
            }
            _ => {}
        }
    }

    fn collect_named_precedents(
        &self,
        name: &str,
        current_sheet_idx: usize,
        origin_addr: CellAddress,
        scoped_names: &HashSet<String>,
        visiting_names: &mut HashSet<String>,
        out: &mut Vec<(usize, CellRange)>,
    ) {
        let key = name.to_uppercase();
        if scoped_names.contains(&key) || !visiting_names.insert(key.clone()) {
            return;
        }
        if let Some(entry) = self.named_values.get(&key) {
            match &entry.definition {
                NamedDefinition::Range { sheet_key, range: Some(range) } => {
                    if let Some(target_idx) = self.sheet_keys.iter().position(|k| k == sheet_key) {
                        out.push((target_idx, range.normalize()));
                    }
                }
                NamedDefinition::Range { range: None, .. } => {}
                NamedDefinition::Value(val) => {
                    self.collect_lambda_value_precedents(val, current_sheet_idx, origin_addr, visiting_names, out);
                }
                NamedDefinition::CustomFormula(def) => {
                    let lambda = def.lambda_value(|n| {
                        matches!(self.named_values.get(n), Some(NamedEntry { definition: NamedDefinition::CustomFormula(_), .. }))
                    });
                    self.collect_lambda_value_precedents(&lambda, current_sheet_idx, origin_addr, visiting_names, out);
                }
            }
        } else if let Some(resolved) = self.resolve_auditing_table_ref(current_sheet_idx, Some(origin_addr), Some(name), TableArea::Data, None) {
            out.push(resolved);
        }
        visiting_names.remove(&key);
    }

    fn collect_lambda_value_precedents(
        &self,
        value: &Value,
        current_sheet_idx: usize,
        origin_addr: CellAddress,
        visiting_names: &mut HashSet<String>,
        out: &mut Vec<(usize, CellRange)>,
    ) {
        let Value::Lambda(lambda) = value else { return };
        let Some(lambda) = lambda.as_any().downcast_ref::<ExcelLambda>() else { return };
        let mut scoped: HashSet<String> = lambda.params.iter().map(|p| p.to_uppercase()).collect();
        scoped.extend(lambda.captured.iter().map(|(n, _)| n.to_uppercase()));
        self.collect_precedent_ranges(&lambda.body, current_sheet_idx, origin_addr, &scoped, visiting_names, out);
        for (_, captured) in &lambda.captured {
            self.collect_lambda_value_precedents(captured, current_sheet_idx, origin_addr, visiting_names, out);
        }
    }

    fn clamp_grid_range(start: CellAddress, end: CellAddress) -> CellRange {
        let s = CellAddress::new(start.row.min(GRID_MAX_ROW), start.col.min(GRID_MAX_COL));
        let e = CellAddress::new(end.row.min(GRID_MAX_ROW), end.col.min(GRID_MAX_COL));
        CellRange::new(s, e).normalize()
    }
}
