//! 结构历史按原始存储恢复；不把公式结果变成值，不在半次恢复时重新校验公式。
use super::*;
use crate::history_snapshot::HistorySnapshot;

pub(crate) struct StructuralObservers {
    buckets: HashMap<CellAddress, AddressSubscriptionBucket>,
    values: Vec<(CellAddress, Value)>,
}

impl Sheet {
    /// 多表恢复时，把直接回调延迟到整批数据、元数据、spill 都已落地之后。
    pub(crate) fn suspend_structure_notifications(&mut self) -> StructuralObservers {
        let addrs: Vec<_> = self.cell_subscriptions.keys().copied().collect();
        let values = addrs
            .iter()
            .map(|addr| (*addr, self.peek_value(*addr)))
            .collect();
        for addr in addrs {
            self.detach_address_sub(addr);
        }
        StructuralObservers {
            buckets: std::mem::take(&mut self.cell_subscriptions),
            values,
        }
    }

    pub(crate) fn resume_structure_notifications(&mut self, observers: StructuralObservers) {
        self.prune_obsolete_formula_atoms();
        self.cell_subscriptions = observers.buckets;
        for (addr, _) in &observers.values {
            self.attach_address_sub(*addr);
        }
        for (addr, before) in observers.values {
            if self.peek_value(addr) != before {
                self.notify_address_subscribers(addr);
            }
        }
    }

    /// 返回最终需要重新投影的数组锚点；调用者必须等所有表都恢复后再执行它们。
    pub(crate) fn restore_structure_content(
        &mut self,
        snapshots: &[&HistorySnapshot],
    ) -> Vec<CellAddress> {
        let mut anchors = self.teardown_all_spills();
        anchors.extend(self.teardown_blocked_spill_anchors());
        self.bump_formula_topology_epoch();
        let points: HashSet<_> = snapshots
            .iter()
            .filter(|s| s.range.start == s.range.end)
            .map(|s| s.range.start)
            .collect();
        let ranges: Vec<_> = snapshots
            .iter()
            .filter(|s| s.range.start != s.range.end)
            .map(|s| s.range)
            .collect();
        // 一次稀疏扫描，不为每条跨表引用重复扫描整张表。
        let mut touched = self.drop_cells_in(|addr| {
            points.contains(&addr) || ranges.iter().any(|range| range.contains(addr))
        });
        for snapshot in snapshots {
            for cell in snapshot.cells.as_deref().unwrap_or_default() {
                touched.insert(cell.addr);
                if let Some(source) = &cell.formula {
                    self.interior
                        .formula_source
                        .borrow_mut()
                        .insert(cell.addr, ParkedFormula::new(source.clone()));
                    self.interior.needs_parse.borrow_mut().insert(cell.addr);
                    if source_may_produce_array(source) {
                        anchors.push(cell.addr);
                    }
                } else if let Some(value) =
                    cell.value.as_ref().filter(|value| **value != Value::Null)
                {
                    self.interior
                        .cells
                        .borrow_mut()
                        .insert(cell.addr, CellSlot::Plain(value.clone()));
                }
                self.invalidate_formula_value(cell.addr);
            }
            self.restore_format_range_snapshot(snapshot.formats.clone());
            for (col, _) in
                self.col_widths_in_range(snapshot.range.start.col, snapshot.range.end.col)
            {
                self.clear_col_width(col);
            }
            for (col, width) in &snapshot.column_widths {
                self.set_col_width(*col, *width);
            }
        }
        // SUM(A:A) 等稀疏范围还依赖成员索引；仅恢复单格 facade 不会唤醒它。
        for addr in touched {
            self.bump_range_membership_epochs_touching(addr);
        }
        anchors
    }
}
