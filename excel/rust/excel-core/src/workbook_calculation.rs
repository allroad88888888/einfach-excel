//! 手动重算复用 Store 依赖传播及现有 spill 维护，不维护第二张计算图。

use super::*;

impl Workbook {
    /// `Some(index)` 强制重算该表，`None` 强制重算整个工作簿。
    /// 跨表下游仍由 Store 传播；无关表的公式不强制失效。
    /// 只枚举已有公式（包括尚未读取的导入公式），不扫描空白网格。
    /// 不更改内容、格式或历史；仅重试当前范围消费的异步失败缓存。
    pub fn recalculate(&mut self, sheet: Option<usize>) -> Result<usize, &'static str> {
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
        let roots: Vec<_> = selected
            .iter()
            .flat_map(|(index, addrs)| {
                addrs
                    .iter()
                    .flat_map(|addr| self.sheets[*index].store_root_atoms_for_addr(*addr))
            })
            .collect();
        let dependents = self.store.reverse_dependents(&roots);
        let store = self.store.clone();
        store.batch(|_| {
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
            .map(|(index, sheet)| {
                let mut arrays = sheet.array_formula_addrs_for_store_atoms(&dependents);
                if let Some((_, addrs)) = selected.iter().find(|(target, _)| *target == index) {
                    let inner: Vec<_> = addrs
                        .iter()
                        .filter_map(|addr| sheet.formula_inner_atom(*addr))
                        .collect();
                    arrays.extend(sheet.array_formula_addrs_for_store_atoms(&inner));
                }
                (index, arrays)
            })
            .collect();
        // 依赖顺序由 Store 决定，不能按工作表顺序重建动态数组几何。
        self.recompute_array_formula_groups(groups);
        store.settle_pending_reads();
        Ok(count)
    }
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
