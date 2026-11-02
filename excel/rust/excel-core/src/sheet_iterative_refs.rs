//! Collect formula dependency edges for iterative cycle discovery.

use super::*;
use crate::eval::ExcelLambda;
use crate::workbook::NamedDefinition;

impl WorkbookAtomContext {
    pub(super) fn collect_expr_refs(
        &self,
        current_sheet: usize,
        current_addr: CellAddress,
        expr: &Expr,
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<(usize, String)>,
    ) {
        match expr {
            Expr::CellRef(addr, _) => out.push((current_sheet, *addr)),
            Expr::Range { start, end, .. } => {
                self.collect_range_formula_refs(
                    current_sheet,
                    CellRange::new(*start, *end),
                    (current_sheet, current_addr),
                    out,
                );
            }
            Expr::SheetRef { sheet, addr, .. } => {
                let sheet_idx = self.iterative_sheet_index(sheet);
                if let Some(sheet_idx) = sheet_idx {
                    out.push((sheet_idx, *addr));
                }
            }
            Expr::SheetRange {
                sheet, start, end, ..
            } => {
                let sheet_idx = self.iterative_sheet_index(sheet);
                if let Some(sheet_idx) = sheet_idx {
                    self.collect_range_formula_refs(
                        sheet_idx,
                        CellRange::new(*start, *end),
                        (current_sheet, current_addr),
                        out,
                    );
                }
            }
            Expr::BinOp { left, right, .. }
            | Expr::DynamicRange {
                start: left,
                end: right,
            } => {
                self.collect_expr_refs(current_sheet, current_addr, left, out, visiting_names);
                self.collect_expr_refs(current_sheet, current_addr, right, out, visiting_names);
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                self.collect_expr_refs(current_sheet, current_addr, inner, out, visiting_names);
            }
            Expr::FuncCall { name, args } => {
                self.collect_named_expr_refs(
                    name,
                    current_sheet,
                    current_addr,
                    out,
                    visiting_names,
                );
                for arg in args {
                    self.collect_expr_refs(current_sheet, current_addr, arg, out, visiting_names);
                }
            }
            Expr::Name(name) => {
                self.collect_named_expr_refs(
                    name,
                    current_sheet,
                    current_addr,
                    out,
                    visiting_names,
                );
            }
            Expr::SheetName { sheet, name } => {
                if let Some(sheet_idx) = self.iterative_sheet_index(sheet) {
                    self.collect_named_expr_refs(
                        name,
                        sheet_idx,
                        current_addr,
                        out,
                        visiting_names,
                    );
                }
            }
            Expr::Sheet3DRef {
                start_sheet,
                end_sheet,
                addr,
                ..
            } => {
                if let Some(span) = self.iterative_sheet_span(start_sheet, end_sheet) {
                    out.extend(span.map(|sheet| (sheet, *addr)));
                }
            }
            Expr::Sheet3DRange {
                start_sheet,
                end_sheet,
                start,
                end,
                ..
            } => {
                if let Some(span) = self.iterative_sheet_span(start_sheet, end_sheet) {
                    for sheet in span {
                        self.collect_range_formula_refs(
                            sheet,
                            CellRange::new(*start, *end),
                            (current_sheet, current_addr),
                            out,
                        );
                    }
                }
            }
            Expr::Call(callee, args) => {
                self.collect_expr_refs(current_sheet, current_addr, callee, out, visiting_names);
                for arg in args {
                    self.collect_expr_refs(current_sheet, current_addr, arg, out, visiting_names);
                }
            }
            Expr::ArrayLit { data, .. } | Expr::MultiArea(data) => {
                for item in data {
                    self.collect_expr_refs(current_sheet, current_addr, item, out, visiting_names);
                }
            }
            Expr::Number(_)
            | Expr::Text(_)
            | Expr::Bool(_)
            | Expr::Error(_)
            | Expr::Omitted
            | Expr::TableRef { .. } => {}
        }
    }

    fn collect_range_formula_refs(
        &self,
        sheet_idx: usize,
        range: CellRange,
        current: (usize, CellAddress),
        out: &mut Vec<(usize, CellAddress)>,
    ) {
        let range = range.normalize();
        if current.0 == sheet_idx && range.contains(current.1) {
            out.push(current);
        }
        let Some(ctx) = self.sheet_facade_ctx(sheet_idx) else {
            return;
        };
        for addr in ctx.interior.formula_cells.borrow().keys() {
            if range.contains(addr) {
                out.push((sheet_idx, addr));
            }
        }
        for &addr in ctx.interior.needs_parse.borrow().iter() {
            if range.contains(addr) {
                out.push((sheet_idx, addr));
            }
        }
    }

    fn collect_named_expr_refs(
        &self,
        name: &str,
        current_sheet: usize,
        current_addr: CellAddress,
        out: &mut Vec<(usize, CellAddress)>,
        visiting_names: &mut HashSet<(usize, String)>,
    ) {
        let key = name.to_uppercase();
        let token = (current_sheet, key.clone());
        if !visiting_names.insert(token.clone()) {
            return;
        }
        let sheet_key = self.topology.borrow().keys.get(current_sheet).copied();
        let def = sheet_key
            .and_then(|sk| self.sheet_names.borrow().get(&(sk, key.clone())).cloned())
            .or_else(|| self.names.borrow().get(&key).cloned());
        if let Some(def) = def {
            match def {
                NamedDefinition::Range {
                    sheet_key,
                    range: Some(range),
                } => {
                    let sheet_idx = self.topology.borrow().by_key.get(&sheet_key).copied();
                    if let Some(sheet_idx) = sheet_idx {
                        self.collect_range_formula_refs(
                            sheet_idx,
                            range,
                            (current_sheet, current_addr),
                            out,
                        );
                    }
                }
                NamedDefinition::Formula { expr, .. } => {
                    self.collect_expr_refs(current_sheet, current_addr, &expr, out, visiting_names);
                }
                NamedDefinition::Value(Value::Lambda(lambda)) => {
                    if let Some(lambda) = lambda.as_any().downcast_ref::<ExcelLambda>() {
                        self.collect_expr_refs(
                            current_sheet,
                            current_addr,
                            &lambda.body,
                            out,
                            visiting_names,
                        );
                    }
                }
                NamedDefinition::CustomFormula(definition) => {
                    let lambda = definition.lambda_value(|candidate| {
                        matches!(
                            self.names.borrow().get(candidate),
                            Some(NamedDefinition::CustomFormula(_))
                        )
                    });
                    if let Value::Lambda(lambda) = lambda {
                        if let Some(lambda) = lambda.as_any().downcast_ref::<ExcelLambda>() {
                            self.collect_expr_refs(
                                current_sheet,
                                current_addr,
                                &lambda.body,
                                out,
                                visiting_names,
                            );
                        }
                    }
                }
                _ => {}
            }
        }
        visiting_names.remove(&token);
    }
    fn iterative_sheet_index(&self, name: &str) -> Option<usize> {
        let topology = self.topology.borrow();
        topology.by_name.get(name).copied().or_else(|| {
            topology.sheets.iter().position(|(sheet, _)| {
                sheet.eq_ignore_ascii_case(name) || sheet.to_lowercase() == name.to_lowercase()
            })
        })
    }

    fn iterative_sheet_span(
        &self,
        start: &str,
        end: &str,
    ) -> Option<std::ops::RangeInclusive<usize>> {
        let start = self.iterative_sheet_index(start)?;
        let end = self.iterative_sheet_index(end)?;
        Some(start.min(end)..=start.max(end))
    }
}
