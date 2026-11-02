//! 工作簿级循环引用强连通分量（SCC）识别与不动点迭代求值。

use super::*;
use crate::workbook::IterativeConfig;

pub(super) struct ActiveSccGuard {
    context: Rc<WorkbookAtomContext>,
}

impl ActiveSccGuard {
    pub(super) fn enter(context: &Rc<WorkbookAtomContext>, scc: &[(usize, CellAddress)]) -> Self {
        context.iterative_solving.set(true);
        let mut active = context.iterative_active_scc.borrow_mut();
        active.clear();
        active.extend(scc.iter().copied());
        drop(active);
        Self {
            context: Rc::clone(context),
        }
    }
}

impl Drop for ActiveSccGuard {
    fn drop(&mut self) {
        self.context.iterative_active_scc.borrow_mut().clear();
        self.context.iterative_solving.set(false);
    }
}

pub(super) fn within_max_change(old_val: &Value, new_val: &Value, max_change: f64) -> bool {
    let as_num = |v: &Value| match v {
        Value::Number(n) => Some(*n),
        Value::Null => Some(0.0),
        _ => None,
    };
    match (as_num(old_val), as_num(new_val)) {
        (Some(a), Some(b)) => (b - a).abs() <= max_change,
        _ => old_val == new_val,
    }
}

impl WorkbookAtomContext {
    pub(crate) fn iterative_config(&self) -> IterativeConfig {
        self.iterative_config.get()
    }

    pub(crate) fn set_iterative_config(&self, config: IterativeConfig) {
        self.iterative_config.set(config.normalized());
    }

    pub(crate) fn mark_installed_cycles(&self) {
        self.has_installed_cycles.set(true);
    }

    pub(crate) fn clear_iterative_values(&self) {
        self.iterative_values.borrow_mut().clear();
        self.iterative_converged.borrow_mut().clear();
    }

    pub(crate) fn clear_iterative_converged(&self) {
        self.iterative_converged.borrow_mut().clear();
    }

    pub(crate) fn clear_iterative_cell(&self, sheet_idx: usize, addr: CellAddress) {
        self.iterative_values
            .borrow_mut()
            .remove(&(sheet_idx, addr));
        self.iterative_converged.borrow_mut().clear();
    }

    pub(super) fn depend_iterative(&self, args: &ReadArgs) {
        let id = self.epoch_atom(&self.iterative_epoch, self.iterative_revision.get());
        let _ = args.get(id);
    }

    pub(crate) fn bump_iterative_epoch(&self) {
        self.bump_epoch(&self.iterative_epoch, &self.iterative_revision);
    }

    pub(super) fn is_in_active_scc(&self, sheet_idx: usize, addr: CellAddress) -> bool {
        self.iterative_solving.get()
            && self
                .iterative_active_scc
                .borrow()
                .contains(&(sheet_idx, addr))
    }

    pub(super) fn iterative_value_or_seed(&self, sheet_idx: usize, addr: CellAddress) -> Value {
        self.iterative_values
            .borrow()
            .get(&(sheet_idx, addr))
            .cloned()
            .unwrap_or(Value::Number(0.0))
    }

    pub(super) fn sheet_facade_ctx(&self, sheet_idx: usize) -> Option<FacadeCtx> {
        self.topology
            .borrow()
            .sheets
            .get(sheet_idx)
            .map(|(_, ctx)| ctx.clone())
    }

    pub(super) fn cycle_scc_for(
        &self,
        root_sheet: usize,
        root_addr: CellAddress,
    ) -> Option<Vec<(usize, CellAddress)>> {
        let root = (root_sheet, root_addr);
        let root_ctx = self.sheet_facade_ctx(root_sheet)?;
        let root_expr = root_ctx.formula_expr_for(root_addr)?;

        let mut forward_visited: HashSet<(usize, CellAddress)> = HashSet::new();
        let mut stack: Vec<(usize, CellAddress)> = Vec::new();
        let mut edges: Vec<((usize, CellAddress), (usize, CellAddress))> = Vec::new();
        let mut root_reached = false;

        let mut direct_refs = Vec::new();
        self.collect_expr_refs(root_sheet, root_addr, &root_expr, &mut direct_refs, &mut HashSet::new());
        for next in direct_refs {
            edges.push((root, next));
            if next == root {
                root_reached = true;
            }
            if forward_visited.insert(next) {
                stack.push(next);
            }
        }

        while let Some(curr) = stack.pop() {
            let Some(curr_ctx) = self.sheet_facade_ctx(curr.0) else { continue };
            let Some(curr_expr) = curr_ctx.formula_expr_for(curr.1) else { continue };
            let mut refs = Vec::new();
            self.collect_expr_refs(curr.0, curr.1, &curr_expr, &mut refs, &mut HashSet::new());
            for next in refs {
                edges.push((curr, next));
                if next == root {
                    root_reached = true;
                }
                if forward_visited.insert(next) {
                    stack.push(next);
                }
            }
        }

        if !root_reached {
            return None;
        }

        let mut scc_set: HashSet<(usize, CellAddress)> = HashSet::from([root]);
        let mut rev_stack: Vec<(usize, CellAddress)> = vec![root];
        while let Some(target) = rev_stack.pop() {
            for &(from, to) in &edges {
                if to == target && forward_visited.contains(&from) && scc_set.insert(from) {
                    rev_stack.push(from);
                }
            }
        }

        let mut scc: Vec<(usize, CellAddress)> = scc_set
            .into_iter()
            .filter(|&(s_idx, c_addr)| {
                if (s_idx, c_addr) == root {
                    return true;
                }
                let Some(ctx) = self.sheet_facade_ctx(s_idx) else {
                    return false;
                };
                !(ctx.interior.manual_calculation.get()
                    && ctx
                        .interior
                        .manual_formula_cache
                        .borrow()
                        .contains_key(&c_addr))
            })
            .collect();
        scc.sort_unstable_by_key(|&(s_idx, addr)| (s_idx, addr.row, addr.col));
        Some(scc)
    }


}

impl FacadeCtx {
    pub(super) fn is_iterative_enabled(&self) -> bool {
        self.workbook_scope()
            .is_some_and(|(context, _)| context.iterative_config().enabled)
    }

    pub(super) fn mark_installed_cycles(&self) {
        if let Some((context, _)) = self.workbook_scope() {
            context.mark_installed_cycles();
        }
    }

    pub(super) fn clear_iterative_on_write(&self, addr: CellAddress) {
        if let Some((context, sheet_idx)) = self.workbook_scope() {
            context.clear_iterative_cell(sheet_idx, addr);
        }
    }

    pub(super) fn solve_iterative_scc(
        &self,
        context: &Rc<WorkbookAtomContext>,
        root_sheet: usize,
        root_addr: CellAddress,
        root_expr: &Expr,
        scc: &[(usize, CellAddress)],
        args: &ReadArgs,
    ) -> Value {
        context.depend_iterative(args);
        let prev_values: Vec<((usize, CellAddress), Option<Value>)> = {
            let mut values = context.iterative_values.borrow_mut();
            let mut snapshot = Vec::with_capacity(scc.len());
            for &cell in scc {
                snapshot.push((cell, values.get(&cell).cloned()));
                values.entry(cell).or_insert(Value::Number(0.0));
            }
            snapshot
        };

        let mut members = Vec::with_capacity(scc.len());
        for &(s_idx, c_addr) in scc {
            let Some(member_ctx) = context.sheet_facade_ctx(s_idx) else {
                continue;
            };
            let Some(member_expr) = member_ctx.formula_expr_for(c_addr) else {
                continue;
            };
            members.push(((s_idx, c_addr), member_ctx, member_expr));
        }

        let config = context.iterative_config();
        let max_iterations = config.max_iterations.clamp(1, 32_767);
        let max_change = config.max_change.max(0.0);

        let _scc_guard = ActiveSccGuard::enter(context, scc);
        for _step in 0..max_iterations {
            let mut all_within_tolerance = true;
            for &((s_idx, c_addr), ref member_ctx, ref member_expr) in &members {
                let old_val = context.iterative_value_or_seed(s_idx, c_addr);
                let new_val = member_ctx.eval_single_pass(c_addr, member_expr, args);
                if args.is_faulted() {
                    let mut values = context.iterative_values.borrow_mut();
                    for (cell, prev) in prev_values {
                        match prev {
                            Some(val) => {
                                values.insert(cell, val);
                            }
                            None => {
                                values.remove(&cell);
                            }
                        }
                    }
                    return Value::Null;
                }
                if !within_max_change(&old_val, &new_val, max_change) {
                    all_within_tolerance = false;
                }
                context
                    .iterative_values
                    .borrow_mut()
                    .insert((s_idx, c_addr), new_val);
            }
            if all_within_tolerance {
                break;
            }
        }

        let _ = self.eval_single_pass(root_addr, root_expr, args);
        if args.is_faulted() {
            return Value::Null;
        }
        {
            let mut converged = context.iterative_converged.borrow_mut();
            converged.remove(&(root_sheet, root_addr));
            for &(s_idx, c_addr) in scc {
                if (s_idx, c_addr) != (root_sheet, root_addr) {
                    converged.insert((s_idx, c_addr));
                }
            }
        }
        context.iterative_value_or_seed(root_sheet, root_addr)
    }
}

impl Sheet {
    pub(crate) fn restore_hydrated_cyclic_formulas(&mut self) -> bool {
        let cyclic_addrs: Vec<(CellAddress, String)> = {
            let exprs = self.interior.formula_exprs.borrow();
            let texts = self.interior.formula_texts.borrow();
            exprs
                .iter()
                .filter_map(|(&addr, expr)| {
                    if matches!(expr.as_ref(), Expr::Error(ValueError::CyclicRef)) {
                        texts.get(&addr).map(|text| (addr, text.clone()))
                    } else {
                        None
                    }
                })
                .collect()
        };
        if cyclic_addrs.is_empty() {
            return false;
        }
        self.restore_formula_sources(
            cyclic_addrs
                .iter()
                .map(|(addr, source)| (*addr, source.as_str())),
        );
        true
    }
}

