//! 本地公式静态环检测算法。

use super::*;

impl Sheet {
    pub(super) fn bump_formula_topology_epoch(&self) {
        if let Some(next) = self.formula_topology_epoch.get().checked_add(1) {
            self.formula_topology_epoch.set(next);
            return;
        }

        // Practically unreachable, but avoid accepting ancient certificates
        // after u64 wraparound.
        {
            let records = self.interior.formula_cells.borrow();
            for (_, record) in records.iter() {
                record.cycle_checked_at.set(0);
            }
        }
        {
            let sources = self.interior.formula_source.borrow();
            for (_, source) in sources.iter() {
                source.cycle_checked_at.set(0);
            }
        }
        self.formula_topology_epoch.set(1);
    }

    pub(super) fn formula_cycle_is_checked(&self, addr: CellAddress, epoch: u64) -> bool {
        if let Some(record) = self.interior.formula_cells.borrow().get(&addr) {
            return record.cycle_checked_at.get() == epoch;
        }
        self.interior
            .formula_source
            .borrow()
            .get(&addr)
            .is_some_and(|source| source.cycle_checked_at.get() == epoch)
    }

    pub(super) fn mark_formula_cycle_checked(&self, addr: CellAddress, epoch: u64) {
        if let Some(record) = self.interior.formula_cells.borrow().get(&addr) {
            record.cycle_checked_at.set(epoch);
            return;
        }
        if let Some(source) = self.interior.formula_source.borrow().get(&addr) {
            source.cycle_checked_at.set(epoch);
        }
    }

    pub(crate) fn cycle_expr_for(&self, addr: CellAddress) -> Option<Rc<Expr>> {
        if let Some(expr) = self.interior.formula_exprs.borrow().get(&addr).cloned() {
            return Some(expr);
        }
        let source = self.interior.formula_source.borrow().get(&addr).cloned()?;
        parse_formula(source.source.as_ref()).map(Rc::new)
    }

    pub(crate) fn formula_addrs_in_range(&self, range: CellRange) -> HashSet<CellAddress> {
        let range = range.normalize();
        let formula_exprs = self.interior.formula_exprs.borrow();
        let formula_source = self.interior.formula_source.borrow();
        formula_exprs
            .keys()
            .copied()
            .chain(formula_source.keys())
            .filter(|addr| range.contains(*addr))
            .collect()
    }

    /// Append formula addresses referenced by `expr` for the install-time
    /// cycle walk. Ranges enqueue only formula cells, because literals cannot
    /// continue a dependency path. Large and unbounded ranges scan the sparse
    /// formula tables instead of expanding the coordinate space.
    ///
    /// This is an on-demand AST/source walk, not a retained dependency index.
    /// Store edges remain the runtime dependency truth; source inspection is
    /// required here because a never-read formula intentionally has no Store
    /// edges yet.
    pub(super) fn collect_cycle_refs(
        &self,
        expr: &Expr,
        target: CellAddress,
        out: &mut Vec<CellAddress>,
        detect_unbounded_target: bool,
    ) -> bool {
        match expr {
            Expr::CellRef(addr, _) => {
                if *addr == target {
                    return true;
                }
                out.push(*addr);
            }
            Expr::Range { start, end, .. } => {
                let range = CellRange::new(*start, *end).normalize();
                let is_unbounded = range.end.row == u32::MAX || range.end.col == u32::MAX;
                if range.contains(target) && (detect_unbounded_target || !is_unbounded) {
                    return true;
                }

                let formula_exprs = self.interior.formula_exprs.borrow();
                let formula_source = self.interior.formula_source.borrow();
                let formula_count = formula_exprs.len().saturating_add(formula_source.len());
                let bounds = range_geometry_bounds(range);
                let cell_count = range_cell_count_u64(range);

                if cell_count <= formula_count as u64 {
                    for row in bounds.start_row..=bounds.end_row {
                        for col in bounds.start_col..=bounds.end_col {
                            let addr = CellAddress::new(row, col);
                            if formula_exprs.contains_key(&addr)
                                || formula_source.contains_key(&addr)
                            {
                                out.push(addr);
                            }
                        }
                    }
                } else {
                    out.extend(
                        formula_exprs
                            .keys()
                            .copied()
                            .chain(formula_source.keys())
                            .filter(|addr| range.contains(*addr)),
                    );
                }
            }
            Expr::BinOp { left, right, .. } => {
                if self.collect_cycle_refs(left, target, out, detect_unbounded_target) {
                    return true;
                }
                if self.collect_cycle_refs(right, target, out, detect_unbounded_target) {
                    return true;
                }
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                if self.collect_cycle_refs(inner, target, out, detect_unbounded_target) {
                    return true;
                }
            }
            Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
                for arg in args {
                    if self.collect_cycle_refs(arg, target, out, detect_unbounded_target) {
                        return true;
                    }
                }
            }
            Expr::DynamicRange { start, end } => {
                if self.collect_cycle_refs(start, target, out, detect_unbounded_target) {
                    return true;
                }
                if self.collect_cycle_refs(end, target, out, detect_unbounded_target) {
                    return true;
                }
            }
            Expr::Call(callee, args) => {
                if self.collect_cycle_refs(callee, target, out, detect_unbounded_target) {
                    return true;
                }
                for arg in args {
                    if self.collect_cycle_refs(arg, target, out, detect_unbounded_target) {
                        return true;
                    }
                }
            }
            Expr::SheetRef { .. }
            | Expr::SheetRange { .. }
            | Expr::Number(_)
            | Expr::Text(_)
            | Expr::Bool(_)
            | Expr::Error(_)
            | Expr::Name(_)
            | Expr::ArrayLit { .. }
            // 空占位实参没有地址。
            | Expr::Omitted
            // Structured reference carries no static A1 ref (design §5.2).
            | Expr::TableRef { .. } => {}
        }
        false
    }

    /// Static cycle detection (B.2). Returns true iff installing `expr` at
    /// `target` would close a same-sheet dep cycle.
    pub(super) fn closes_local_cycle(&self, target: CellAddress, expr: &Expr) -> bool {
        let mut stack: Vec<CellAddress> = Vec::new();
        // Keep the established direct whole-row/whole-column self-reference
        // behavior: install the formula and let runtime evaluation surface the
        // cycle. Once the walk follows another formula, an unbounded range
        // containing `target` is a real install-time back-edge.
        if self.collect_cycle_refs(expr, target, &mut stack, false) {
            return true;
        }
        let mut seen: HashSet<CellAddress> = HashSet::new();
        while let Some(addr) = stack.pop() {
            if !seen.insert(addr) {
                continue;
            }
            if let Some(next) = self.cycle_expr_for(addr) {
                if self.collect_cycle_refs(&next, target, &mut stack, true) {
                    return true;
                }
            }
        }
        false
    }

    pub(super) fn has_direct_unbounded_target_ref(expr: &Expr, target: CellAddress) -> bool {
        match expr {
            Expr::Range { start, end, .. } => {
                let range = CellRange::new(*start, *end).normalize();
                (range.end.row == u32::MAX || range.end.col == u32::MAX) && range.contains(target)
            }
            Expr::BinOp { left, right, .. } => {
                Self::has_direct_unbounded_target_ref(left, target)
                    || Self::has_direct_unbounded_target_ref(right, target)
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                Self::has_direct_unbounded_target_ref(inner, target)
            }
            Expr::FuncCall { args, .. } | Expr::MultiArea(args) => args
                .iter()
                .any(|arg| Self::has_direct_unbounded_target_ref(arg, target)),
            Expr::DynamicRange { start, end } => {
                Self::has_direct_unbounded_target_ref(start, target)
                    || Self::has_direct_unbounded_target_ref(end, target)
            }
            Expr::Call(callee, args) => {
                Self::has_direct_unbounded_target_ref(callee, target)
                    || args
                        .iter()
                        .any(|arg| Self::has_direct_unbounded_target_ref(arg, target))
            }
            Expr::CellRef(..)
            | Expr::SheetRef { .. }
            | Expr::SheetRange { .. }
            | Expr::Number(_)
            | Expr::Text(_)
            | Expr::Bool(_)
            | Expr::Error(_)
            | Expr::Name(_)
            | Expr::ArrayLit { .. }
            // 空占位实参没有地址。
            | Expr::Omitted
            // Structured reference carries no static A1 ref (design §5.2).
            | Expr::TableRef { .. } => false,
        }
    }

    /// Static cycle check for a formula that was already present in parked
    /// source topology. The temporary reachable graph lets one cold read
    /// certify every reachable non-cyclic formula in O(V+E), while embedded
    /// generation stamps make later reads cut at those formulas. No graph or
    /// edge list survives this call.
    pub(super) fn closes_parked_local_cycle(
        &self,
        target: CellAddress,
        expr: Rc<Expr>,
        target_checked_at: u64,
    ) -> StaticCycleCheckOutcome {
        let epoch = self.formula_topology_epoch.get();
        if target_checked_at == epoch {
            return StaticCycleCheckOutcome {
                closes_cycle: false,
                target_certified: true,
            };
        }

        let suppress_target_certificate =
            Self::has_direct_unbounded_target_ref(expr.as_ref(), target);
        let mut nodes = vec![StaticCycleNode {
            addr: target,
            expr,
            edges: Vec::new(),
        }];
        let mut node_index: HashMap<CellAddress, usize> = HashMap::new();
        node_index.insert(target, 0);

        let mut cursor = 0;
        while cursor < nodes.len() {
            self.static_cycle_node_visit_count
                .set(self.static_cycle_node_visit_count.get().saturating_add(1));
            let node_expr = Rc::clone(&nodes[cursor].expr);
            let mut refs = Vec::new();
            if self.collect_cycle_refs(node_expr.as_ref(), target, &mut refs, cursor != 0) {
                return StaticCycleCheckOutcome {
                    closes_cycle: true,
                    target_certified: false,
                };
            }

            for addr in refs {
                // The root's direct whole-row/whole-column self-reference is
                // intentionally runtime-checked. Its parked entry was drained
                // before this call, but keep this guard for defensive parity.
                if addr == target {
                    if cursor == 0 && suppress_target_certificate {
                        continue;
                    }
                    return StaticCycleCheckOutcome {
                        closes_cycle: true,
                        target_certified: false,
                    };
                }
                if self.formula_cycle_is_checked(addr, epoch) {
                    continue;
                }
                let Some(next_expr) = self.cycle_expr_for(addr) else {
                    continue;
                };
                let next_index = if let Some(index) = node_index.get(&addr).copied() {
                    index
                } else {
                    let index = nodes.len();
                    node_index.insert(addr, index);
                    nodes.push(StaticCycleNode {
                        addr,
                        expr: next_expr,
                        edges: Vec::new(),
                    });
                    index
                };
                nodes[cursor].edges.push(next_index);
            }
            cursor += 1;
        }

        // Iterative Kosaraju keeps deep spreadsheet chains off the Rust call
        // stack. Both adjacency directions are temporary and released before
        // hydration continues into Store evaluation.
        let mut reverse = vec![Vec::new(); nodes.len()];
        for (from, node) in nodes.iter().enumerate() {
            for &to in &node.edges {
                reverse[to].push(from);
            }
        }

        let mut visited = vec![false; nodes.len()];
        let mut finish_order = Vec::with_capacity(nodes.len());
        for start in 0..nodes.len() {
            if visited[start] {
                continue;
            }
            visited[start] = true;
            let mut stack = vec![(start, 0usize)];
            while let Some(&(node, next_edge)) = stack.last() {
                if next_edge < nodes[node].edges.len() {
                    let next = nodes[node].edges[next_edge];
                    let last = stack.len() - 1;
                    stack[last].1 += 1;
                    if !visited[next] {
                        visited[next] = true;
                        stack.push((next, 0));
                    }
                } else {
                    stack.pop();
                    finish_order.push(node);
                }
            }
        }

        let mut assigned = vec![false; nodes.len()];
        let mut cyclic = vec![false; nodes.len()];
        for &start in finish_order.iter().rev() {
            if assigned[start] {
                continue;
            }
            assigned[start] = true;
            let mut members = Vec::new();
            let mut stack = vec![start];
            while let Some(node) = stack.pop() {
                members.push(node);
                for &next in &reverse[node] {
                    if !assigned[next] {
                        assigned[next] = true;
                        stack.push(next);
                    }
                }
            }
            let is_cycle = members.len() > 1
                || nodes[members[0]]
                    .edges
                    .iter()
                    .any(|&next| next == members[0]);
            if is_cycle {
                for member in members {
                    cyclic[member] = true;
                }
            }
        }

        if cyclic[0] {
            return StaticCycleCheckOutcome {
                closes_cycle: true,
                target_certified: false,
            };
        }
        for index in 1..nodes.len() {
            if !cyclic[index] {
                self.mark_formula_cycle_checked(nodes[index].addr, epoch);
            }
        }
        StaticCycleCheckOutcome {
            closes_cycle: false,
            target_certified: !suppress_target_certificate,
        }
    }
}
