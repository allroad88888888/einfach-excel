//! Workbook cycle-detection operations.
//!
//! Complex-file exception: the graph walk, name traversal, and overlay resolution
//! form one cycle-detection algorithm over shared traversal state. Separating them
//! would make the termination and self-reference invariants harder to verify.

use super::*;

impl Workbook {
    pub(crate) fn closes_workbook_cycle(
        &self,
        target_idx: usize,
        target: CellAddress,
        expr: &Expr,
    ) -> bool {
        self.closes_workbook_cycle_with_overlay(target_idx, target, expr, &FormulaOverlay::new())
    }

    fn closes_workbook_cycle_with_overlay(
        &self,
        target_idx: usize,
        target: CellAddress,
        expr: &Expr,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        let mut visited: HashSet<(usize, CellAddress)> = HashSet::new();
        let mut to_visit: Vec<(usize, CellAddress)> = Vec::new();
        self.cycle_ast_walk_count
            .set(self.cycle_ast_walk_count.get() + 1);
        let mut visiting_names = HashSet::new();
        if self.collect_workbook_cycle_refs(
            expr,
            target_idx,
            (target_idx, target),
            &mut to_visit,
            &mut visiting_names,
            false,
            overlay,
        ) {
            return true;
        }

        while let Some((idx, addr)) = to_visit.pop() {
            if idx == target_idx && addr == target {
                return true;
            }
            if !visited.insert((idx, addr)) {
                continue;
            }
            let mut visiting_names = HashSet::new();
            if let Some(next) = overlay.get(&(idx, addr)) {
                let Some(next) = *next else {
                    continue;
                };
                if self.collect_workbook_cycle_refs(
                    next,
                    idx,
                    (target_idx, target),
                    &mut to_visit,
                    &mut visiting_names,
                    true,
                    overlay,
                ) {
                    return true;
                }
            } else {
                let Some(next) = self
                    .sheets
                    .get(idx)
                    .and_then(|sheet| sheet.cycle_expr_for(addr))
                else {
                    continue;
                };
                if self.collect_workbook_cycle_refs(
                    &next,
                    idx,
                    (target_idx, target),
                    &mut to_visit,
                    &mut visiting_names,
                    true,
                    overlay,
                ) {
                    return true;
                }
            }
        }
        false
    }

    fn collect_workbook_cycle_refs(
        &self,
        expr: &Expr,
        current_idx: usize,
        target: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<String>,
        detect_unbounded_target: bool,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        match expr {
            Expr::CellRef(addr, _) => {
                if (current_idx, *addr) == target {
                    return true;
                }
                out.push((current_idx, *addr));
            }
            Expr::Range {
                start,
                end,
                unbounded,
                ..
            } => {
                if self.collect_cycle_range_refs(
                    current_idx,
                    CellRange::new(*start, *end),
                    *unbounded,
                    target,
                    out,
                    detect_unbounded_target,
                    overlay,
                ) {
                    return true;
                }
            }
            Expr::SheetRef { sheet, addr, .. } => {
                if let Some(&sheet_idx) = self.by_name.get(sheet) {
                    if (sheet_idx, *addr) == target {
                        return true;
                    }
                    out.push((sheet_idx, *addr));
                }
            }
            Expr::SheetRange {
                sheet,
                start,
                end,
                unbounded,
                ..
            } => {
                if let Some(&sheet_idx) = self.by_name.get(sheet) {
                    if self.collect_cycle_range_refs(
                        sheet_idx,
                        CellRange::new(*start, *end),
                        *unbounded,
                        target,
                        out,
                        detect_unbounded_target,
                        overlay,
                    ) {
                        return true;
                    }
                }
            }
            Expr::BinOp { left, right, .. } => {
                if self.collect_workbook_cycle_refs(
                    left,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                ) || self.collect_workbook_cycle_refs(
                    right,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                ) {
                    return true;
                }
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                if self.collect_workbook_cycle_refs(
                    inner,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                ) {
                    return true;
                }
            }
            Expr::FuncCall { name, args } => {
                if self.collect_named_cycle_refs(
                    name,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                ) {
                    return true;
                }
                for arg in args {
                    if self.collect_workbook_cycle_refs(
                        arg,
                        current_idx,
                        target,
                        out,
                        visiting_names,
                        detect_unbounded_target,
                        overlay,
                    ) {
                        return true;
                    }
                }
            }
            Expr::DynamicRange { start, end } => {
                if self.collect_workbook_cycle_refs(
                    start,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                ) || self.collect_workbook_cycle_refs(
                    end,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                ) {
                    return true;
                }
            }
            Expr::Name(name) => {
                if self.collect_named_cycle_refs(
                    name,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                ) {
                    return true;
                }
            }
            Expr::Call(callee, args) => {
                if self.collect_workbook_cycle_refs(
                    callee,
                    current_idx,
                    target,
                    out,
                    visiting_names,
                    detect_unbounded_target,
                    overlay,
                ) {
                    return true;
                }
                for arg in args {
                    if self.collect_workbook_cycle_refs(
                        arg,
                        current_idx,
                        target,
                        out,
                        visiting_names,
                        detect_unbounded_target,
                        overlay,
                    ) {
                        return true;
                    }
                }
            }
            Expr::ArrayLit { data, .. } | Expr::MultiArea(data) => {
                for item in data {
                    if self.collect_workbook_cycle_refs(
                        item,
                        current_idx,
                        target,
                        out,
                        visiting_names,
                        detect_unbounded_target,
                        overlay,
                    ) {
                        return true;
                    }
                }
            }
            Expr::Number(_) | Expr::Text(_) | Expr::Bool(_) | Expr::Error(_) | Expr::Omitted => {}
            // Structured (Table) reference: no static A1 ref to follow for
            // cross-sheet cycle detection (design doc §5.2). It resolves
            // dynamically; a Table-mediated cycle surfaces at eval time as
            // `#CYCLE!` via the runtime in-flight guard (§5.3 point 5).
            Expr::TableRef { .. } => {}
        }
        false
    }

    fn collect_cycle_range_refs(
        &self,
        sheet_idx: usize,
        range: CellRange,
        unbounded: RangeBounds,
        target: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
        detect_unbounded_target: bool,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        let range = range.normalize();
        if sheet_idx == target.0
            && range.contains(target.1)
            && (detect_unbounded_target || unbounded == RangeBounds::None)
        {
            return true;
        }
        if let Some(sheet) = self.sheets.get(sheet_idx) {
            let mut formula_addrs = sheet.formula_addrs_in_range(range);
            for ((overlay_sheet_idx, addr), expr) in overlay {
                if *overlay_sheet_idx != sheet_idx || !range.contains(*addr) {
                    continue;
                }
                if expr.is_some() {
                    formula_addrs.insert(*addr);
                } else {
                    formula_addrs.remove(addr);
                }
            }
            out.extend(formula_addrs.into_iter().map(|addr| (sheet_idx, addr)));
        }
        false
    }

    fn collect_named_cycle_refs(
        &self,
        name: &str,
        current_idx: usize,
        target: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<String>,
        detect_unbounded_target: bool,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        let key = name.to_ascii_uppercase();
        if !visiting_names.insert(key.clone()) {
            return false;
        }
        let result = self.named_values.get(&key).is_some_and(|entry| {
            self.collect_value_cycle_refs(
                &entry.value,
                current_idx,
                target,
                out,
                visiting_names,
                detect_unbounded_target,
                overlay,
            )
        });
        visiting_names.remove(&key);
        result
    }

    fn collect_value_cycle_refs(
        &self,
        value: &Value,
        current_idx: usize,
        target: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<String>,
        detect_unbounded_target: bool,
        overlay: &FormulaOverlay<'_>,
    ) -> bool {
        let Value::Lambda(lambda) = value else {
            return false;
        };
        let Some(lambda) = lambda.as_any().downcast_ref::<ExcelLambda>() else {
            return false;
        };
        if self.collect_workbook_cycle_refs(
            &lambda.body,
            current_idx,
            target,
            out,
            visiting_names,
            detect_unbounded_target,
            overlay,
        ) {
            return true;
        }
        lambda.captured.iter().any(|(_, captured)| {
            self.collect_value_cycle_refs(
                captured,
                current_idx,
                target,
                out,
                visiting_names,
                detect_unbounded_target,
                overlay,
            )
        })
    }
}
