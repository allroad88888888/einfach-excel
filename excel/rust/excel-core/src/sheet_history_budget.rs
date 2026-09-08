//! 被历史持有的 Sheet 的估算预算；只读已有存储，不求值、不制作全表快照。
use super::*;
use std::fmt::{self, Write};

impl Sheet {
    pub(crate) fn history_retained_bytes(&self) -> usize {
        // 原子/稀疏索引按条目预留开销；字符串和已物化数组按实际内容计入。
        let mut bytes = std::mem::size_of::<Self>() + self.atoms_owned.get() * 512;
        let atoms: Vec<_> = {
            let cells = self.interior.cells.borrow();
            bytes += cells.len() * 64;
            cells
                .iter()
                .filter_map(|(addr, slot)| match slot {
                    CellSlot::Plain(value) => {
                        bytes += value_bytes(value);
                        None
                    }
                    // spill 子格是派生原子；其值已包含在锚点的数组中，不能重复读取。
                    CellSlot::Atom(id) => {
                        (!self.spill_target_anchor.contains_key(&addr)).then_some(*id)
                    }
                })
                .collect()
        };
        // 释放 cells borrow 后才读 Store；这里只剩字面量/数组锚点的 primitive slot。
        for id in atoms {
            bytes += value_bytes(&self.store.get(id));
        }
        bytes += self
            .interior
            .formula_texts
            .borrow()
            .values()
            .map(|s| 64 + s.len())
            .sum::<usize>();
        bytes += self
            .interior
            .formula_source
            .borrow()
            .values()
            .map(|s| 64 + s.source.len())
            .sum::<usize>();
        bytes += self
            .interior
            .formula_cells
            .borrow()
            .values()
            .map(|record| {
                128 + record.deps.borrow().len() * 32
                    + record.static_ranges.borrow().len() * 48
                    + metadata_bytes(record.expr.as_ref())
            })
            .sum::<usize>();
        bytes += metadata_bytes(&self.cell_styles)
            + metadata_bytes(&self.row_styles)
            + metadata_bytes(&self.column_styles)
            + metadata_bytes(&self.conditional_rules)
            + metadata_bytes(&self.filter)
            + self.hidden_rows.len() * 32
            + self.hidden_columns.len() * 32
            + self.merged_ranges.len() * std::mem::size_of::<CellRange>()
            + self.interior.col_widths.borrow().len() * 48
            + self.spill_target_anchor.len() * 64;
        bytes
    }
}

fn value_bytes(value: &Value) -> usize {
    std::mem::size_of::<Value>()
        + match value {
            Value::Text(text) => text.len(),
            Value::Array(array) => array.data.iter().map(value_bytes).sum(),
            _ => 0,
        }
}

/// 配置的估算包含长字符串，不依赖固定 512 字节假设；写入计数器而非临时 JSON/String。
/// 这是历史预算估计，不是分配器的精确内存统计，也不作为持久化格式。
pub(crate) fn metadata_bytes(value: &impl fmt::Debug) -> usize {
    struct Counter(usize);
    impl Write for Counter {
        fn write_str(&mut self, value: &str) -> fmt::Result {
            self.0 += value.len();
            Ok(())
        }
    }
    let mut counter = Counter(0);
    let _ = write!(&mut counter, "{value:?}");
    std::mem::size_of_val(value) + counter.0 * 2
}
