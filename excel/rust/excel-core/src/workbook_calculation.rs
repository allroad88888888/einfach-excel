//! 手动重算复用 Store 依赖传播及现有 spill 维护，不维护第二张计算图。

use super::*;

/// 工作簿公式求值模式。默认 `Automatic` 保持实时依赖传播；`Manual` 保留已求值结果直到显式重算。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum CalculationMode {
    #[default]
    Automatic,
    Manual,
}

/// 工作簿迭代计算配置（Excel 默认值：禁用、最大迭代次数 100、最大误差 0.001）。
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct IterativeConfig {
    pub enabled: bool,
    pub max_iterations: u32,
    pub max_change: f64,
}

impl Default for IterativeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            max_iterations: 100,
            max_change: 0.001,
        }
    }
}

impl IterativeConfig {
    pub fn normalized(self) -> Self {
        let max_iterations = self.max_iterations.clamp(1, 32_767);
        let max_change = if self.max_change.is_finite() && self.max_change >= 0.0 {
            self.max_change
        } else {
            0.0
        };
        Self {
            enabled: self.enabled,
            max_iterations,
            max_change,
        }
    }
}

impl Workbook {
    pub fn calculation_mode(&self) -> CalculationMode {
        self.suspended_calculation_mode.unwrap_or(self.calculation_mode)
    }

    pub fn iterative_calculation(&self) -> IterativeConfig {
        self.iterative_calculation
    }

    /// 更新工作簿迭代计算配置：`false -> true` 恢复并收敛循环公式；`true -> false` 恢复 `#CYCLE!`。
    pub fn set_iterative_calculation(&mut self, config: IterativeConfig) -> bool {
        if self.is_inside_custom_call() {
            return false;
        }
        let config = config.normalized();
        if self.iterative_calculation == config {
            return false;
        }
        self.iterative_calculation = config;
        self.atom_context.set_iterative_config(config);
        self.atom_context.clear_iterative_values();
        if config.enabled {
            self.atom_context.mark_installed_cycles();
            if !self.cyclic_formulas.is_empty() {
                let drained: Vec<_> = self.cyclic_formulas.drain().collect();
                for sheet_idx in 0..self.sheets.len() {
                    let entries: Vec<_> = drained
                        .iter()
                        .filter_map(|((s_idx, addr), src)| {
                            (*s_idx == sheet_idx).then_some((*addr, src.as_str()))
                        })
                        .collect();
                    if !entries.is_empty() {
                        self.sheets[sheet_idx].restore_formula_sources(entries);
                    }
                }
            }
            for sheet in &mut self.sheets {
                sheet.restore_hydrated_cyclic_formulas();
            }
        }
        let _ = self.recalculate(None);
        true
    }

    /// 切换工作簿计算模式：`Automatic -> Manual` 冻结当前公式结果；`Manual -> Automatic` 立即全表重算。
    pub fn set_calculation_mode(&mut self, mode: CalculationMode) -> bool {
        if self.is_inside_custom_call() { return false; }
        if let Some(saved) = self.suspended_calculation_mode.as_mut() {
            let changed = *saved != mode;
            *saved = mode;
            return changed;
        }
        if self.is_inside_custom_call() || self.calculation_mode == mode {
            return false;
        }
        self.calculation_mode = mode;
        match mode {
            CalculationMode::Manual => {
                let all =
                    CellRange::new(CellAddress::new(0, 0), CellAddress::new(u32::MAX, u32::MAX));
                for sheet in &self.sheets {
                    sheet.set_manual_calculation(false);
                }
                for index in 0..self.sheets.len() {
                    let mut addrs: Vec<_> = self.sheets[index]
                        .formula_addrs_in_range(all)
                        .into_iter()
                        .collect();
                    addrs.sort_unstable_by_key(|addr| (addr.row, addr.col));
                    for addr in addrs {
                        self.sheets[index].peek_value(addr);
                    }
                }
                let groups = (0..self.sheets.len())
                    .map(|index| (index, self.sheets[index].formula_addrs_in_range(all)))
                    .collect();
                self.recompute_array_formula_groups(groups);
                for index in 0..self.sheets.len() {
                    let mut addrs: Vec<_> = self.sheets[index]
                        .formula_addrs_in_range(all)
                        .into_iter()
                        .collect();
                    addrs.sort_unstable_by_key(|addr| (addr.row, addr.col));
                    self.sheets[index].capture_manual_calculation_cache(&addrs);
                }
                self.store.settle_pending_reads();
            }
            CalculationMode::Automatic => {
                for sheet in &self.sheets {
                    sheet.set_manual_calculation(false);
                }
                let _ = self.recalculate(None);
            }
        }
        true
    }

    /// `Some(index)` 强制重算该表，`None` 强制重算整个工作簿。
    /// 跨表下游仍由 Store 传播；无关表的公式不强制失效。
    /// 只枚举已有公式（包括尚未读取的导入公式），不扫描空白网格。
    /// 不更改内容、格式或历史；仅重试当前范围消费的异步失败缓存。
    pub fn recalculate(&mut self, sheet: Option<usize>) -> Result<usize, &'static str> {
        if self.calculation_suspension_depth > 0 {
            return Err("CALCULATION_SUSPENDED");
        }
        if self.is_inside_custom_call() {
            return Err("Cannot recalculate inside a custom-formula callback.");
        }
        if sheet.is_some_and(|index| index >= self.sheets.len()) {
            return Err("Unknown worksheet.");
        }
        self.retry_failed_async_custom_calls(sheet);
        // 这里只做稀疏索引的 contains 筛选，绝不迭代这个坐标矩形。
        let all = CellRange::new(CellAddress::new(0, 0), CellAddress::new(u32::MAX, u32::MAX));
        let selected: Vec<_> = self
            .sheets
            .iter()
            .enumerate()
            .filter(|(index, _)| sheet.is_none_or(|target| target == *index))
            .map(|(index, sheet)| (index, sheet.formula_addrs_in_range(all)))
            .collect();
        let count = selected.iter().map(|(_, addrs)| addrs.len()).sum();
        let is_manual = self.calculation_mode == CalculationMode::Manual;
        if is_manual {
            for (index, _) in &selected {
                self.sheets[*index].set_manual_calculation(false);
            }
        }
        let roots: Vec<_> = selected
            .iter()
            .flat_map(|(index, addrs)| {
                addrs
                    .iter()
                    .flat_map(|addr| self.sheets[*index].store_root_atoms_for_addr(*addr))
            })
            .collect();
        let dependents = self.store.reverse_dependents(&roots);
        self.atom_context.clear_iterative_converged();
        let store = self.store.clone();
        store.batch(|_| {
            self.atom_context.bump_iterative_epoch();
            for (index, addrs) in &selected {
                self.sheets[*index].invalidate_calculation(addrs);
            }
        });
        // batch 关闭后再读取，避免读到尚未传播失效的旧缓存。
        // 主动读完目标公式，保证屏幕外、懒导入公式也完成本次重算。
        for (index, addrs) in &selected {
            let mut ordered: Vec<_> = addrs.iter().copied().collect();
            ordered.sort_unstable_by_key(|addr| (addr.row, addr.col));
            for addr in ordered {
                self.sheets[*index].peek_value(addr);
            }
        }
        let groups = self
            .sheets
            .iter()
            .enumerate()
            .map(|(index, sheet_ref)| {
                let mut arrays = if is_manual && sheet.is_some_and(|target| target != index) {
                    HashSet::new()
                } else {
                    sheet_ref.array_formula_addrs_for_store_atoms(&dependents)
                };
                if let Some((_, addrs)) = selected.iter().find(|(target, _)| *target == index) {
                    let inner: Vec<_> = addrs
                        .iter()
                        .filter_map(|addr| sheet_ref.formula_inner_atom(*addr))
                        .collect();
                    arrays.extend(sheet_ref.array_formula_addrs_for_store_atoms(&inner));
                }
                (index, arrays)
            })
            .collect();
        // 依赖顺序由 Store 决定，不能按工作表顺序重建动态数组几何。
        self.recompute_array_formula_groups(groups);
        if is_manual {
            for (index, addrs) in &selected {
                let mut ordered: Vec<_> = addrs.iter().copied().collect();
                ordered.sort_unstable_by_key(|addr| (addr.row, addr.col));
                self.sheets[*index].capture_manual_calculation_cache(&ordered);
            }
        }
        store.settle_pending_reads();
        Ok(count)
    }
}

impl Workbook {
    /// A temporary, nestable evaluation pause. The requested calculation mode remains persistent.
    pub fn suspend_calculation(&mut self) -> Result<u32, &'static str> {
        if self.is_inside_custom_call() { return Err("Cannot suspend inside a custom formula."); }
        let next = self.calculation_suspension_depth.checked_add(1).ok_or("CALCULATION_PAUSE_LIMIT")?;
        if self.calculation_suspension_depth == 0 {
            let mode = self.calculation_mode;
            self.set_calculation_mode(CalculationMode::Manual);
            self.suspended_calculation_mode = Some(mode);
            self.atom_context.calculation_suspended.set(true);
        }
        self.calculation_suspension_depth = next;
        Ok(next)
    }

    pub fn resume_calculation(&mut self) -> Result<u32, &'static str> {
        if self.is_inside_custom_call() { return Err("Cannot resume inside a custom formula."); }
        if self.calculation_suspension_depth == 0 { return Ok(0); }
        self.calculation_suspension_depth -= 1;
        if self.calculation_suspension_depth == 0 {
            self.atom_context.calculation_suspended.set(false);
            let mode = self.suspended_calculation_mode.take().unwrap_or(CalculationMode::Automatic);
            self.set_calculation_mode(mode);
        }
        Ok(self.calculation_suspension_depth)
    }

    pub fn calculation_suspension_depth(&self) -> u32 { self.calculation_suspension_depth }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_guard_rejects_before_invalidating_any_formula() {
        let mut book = Workbook::new();
        book.set_formula(0, "A1", "=1+2");
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(3.0));
        let evaluations = book.debug_formula_eval_count(0);
        book.custom_call_depth.set(1);
        assert!(book.recalculate(None).is_err());
        book.custom_call_depth.set(0);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(3.0));
        assert_eq!(book.debug_formula_eval_count(0), evaluations);
    }
}
