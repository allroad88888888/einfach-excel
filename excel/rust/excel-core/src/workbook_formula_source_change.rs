//! 只记录实际改写的公式源码；命名区域与 Table 历史共用预检和回放。
use super::*;

#[derive(Debug)]
pub(super) struct FormulaSourceChange {
    pub sheet: usize,
    sheet_key: u64,
    addr: CellAddress,
    before: String,
    after: String,
}

impl FormulaSourceChange {
    pub fn prepare(
        workbook: &Workbook,
        rewrite: &impl Fn(usize, CellRange, &mut Expr) -> Result<bool, &'static str>,
    ) -> Result<Vec<Self>, &'static str> {
        let all = CellRange::new(
            CellAddress::new(0, 0),
            CellAddress::new(GRID_MAX_ROW, GRID_MAX_COL),
        );
        let mut changes = Vec::new();
        for (sheet_index, sheet) in workbook.sheets.iter().enumerate() {
            let mut addresses: Vec<_> = sheet.formula_addrs_in_range(all).into_iter().collect();
            addresses.sort_by_key(|addr| (addr.row, addr.col));
            for addr in addresses {
                let Some(before) = sheet.formula_text_at(addr) else {
                    continue;
                };
                let Some(mut expr) = parse_formula(&before) else {
                    continue;
                };
                if rewrite(sheet_index, CellRange::single(addr), &mut expr)? {
                    changes.push(Self {
                        sheet: sheet_index,
                        sheet_key: workbook.sheet_keys[sheet_index],
                        addr,
                        before,
                        after: crate::render_formula(&expr),
                    });
                }
            }
        }
        Ok(changes)
    }

    pub fn validate(&self, workbook: &Workbook, undo: bool) -> Result<(), &'static str> {
        let expected = if undo { &self.after } else { &self.before };
        if workbook.sheet_key(self.sheet) != Some(self.sheet_key)
            || workbook.sheets[self.sheet]
                .formula_text_at(self.addr)
                .as_ref()
                != Some(expected)
        {
            return Err("A referring formula changed outside history.");
        }
        Ok(())
    }

    pub fn apply(&self, workbook: &mut Workbook, undo: bool) {
        let source = if undo { &self.before } else { &self.after };
        // 包含停放公式；恢复源码走现有依赖安装路径，不把计算结果存成值。
        workbook.sheets[self.sheet].restore_formula_source(self.addr, source);
    }

    pub fn retained_bytes(&self) -> usize {
        self.before.len() + self.after.len() + std::mem::size_of::<Self>()
    }
}
