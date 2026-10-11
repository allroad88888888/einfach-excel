//! 只记录实际改写的公式源码；命名区域、Table 与工作表历史共用预检和回放。
use super::*;

#[derive(Debug)]
pub(crate) struct FormulaSourceChange {
    pub sheet: usize,
    sheet_key: u64,
    addr: CellAddress,
    // None 为真实单元格；Some 为此 Table 的计算列模板（addr 保存原点/绝对列）。
    table_key: Option<String>,
    before: String,
    after: String,
}

impl FormulaSourceChange {
    pub fn prepare(
        workbook: &Workbook,
        // range 决定隐式 Table 归属；Some(origin) 标记模板，不受单元格快照排除。
        rewrite: &impl Fn(usize, CellRange, Option<CellAddress>, &mut Expr) -> bool,
    ) -> Vec<Self> {
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
                if rewrite(sheet_index, CellRange::single(addr), None, &mut expr) {
                    changes.push(Self {
                        sheet: sheet_index,
                        sheet_key: workbook.sheet_keys[sheet_index],
                        addr,
                        table_key: None,
                        before,
                        after: crate::render_formula(&expr),
                    });
                }
            }
        }
        changes.extend(Self::prepare_templates(workbook, rewrite));
        changes
    }

    /// 工作表拓扑已有单元格恢复路径；这里只收集模板，不重复扫描单元格。
    pub fn for_sheet_templates(workbook: &Workbook, old: &str, new: Option<&str>) -> Vec<Self> {
        Self::prepare_templates(workbook, &|_, _, _, expr| {
            let before = expr.clone();
            super::workbook_sheet_refs::rewrite_sheet_refs(expr, old, new);
            *expr != before
        })
    }

    /// 本表模板跟着 Table 定义位移；这里只记录其它表真正改变的限定引用。
    pub fn for_structural_templates(workbook: &Workbook, sheet: usize, edit: crate::shift::ShiftEdit)
        -> Vec<Self> {
        let name = workbook.name(sheet).expect("validated structural sheet");
        Self::prepare_templates(workbook, &|owner, _, _, expr| {
            owner != sheet && crate::shift::rewrite_structural_refs(expr, name, false, edit)
        })
    }

    fn prepare_templates(
        workbook: &Workbook,
        rewrite: &impl Fn(usize, CellRange, Option<CellAddress>, &mut Expr) -> bool,
    ) -> Vec<Self> {
        let mut changes = Vec::new();
        // 模板即使当前全是手工例外也必须随动，不能从现有格反推标准公式。
        for (key, table) in &workbook.tables {
            let Some(sheet) = workbook.index_of(table.sheet_name()) else { continue; };
            for (column, formula) in table.calculated_columns.iter().enumerate() {
                let Some(formula) = formula else { continue; };
                let mut expr = parse_formula(formula.formula()).expect("validated column formula");
                let addr = CellAddress::new(formula.row(), table.range.start.col + column as u32);
                // 原点可能已被缩到表外，隐式 [@Column] 仍以所属 Table 为上下文。
                let context = CellAddress::new(
                    addr.row.clamp(table.range.start.row, table.range.end.row),
                    addr.col,
                );
                if rewrite(sheet, CellRange::single(context), Some(addr), &mut expr) {
                    changes.push(Self {
                        sheet, sheet_key: workbook.sheet_keys[sheet], addr,
                        table_key: Some(key.clone()), before: formula.formula().into(),
                        after: crate::render_formula(&expr),
                    });
                }
            }
        }
        changes
    }

    /// 本 Table 的模板并入已有定义前后像，避免改名/删除后按旧键再次回放。
    pub fn fold_table(changes: &mut Vec<Self>, before: &TableEntry, mut after: Option<&mut TableEntry>) {
        let key = before.name().to_ascii_uppercase();
        changes.retain(|change| {
            if change.table_key.as_ref() != Some(&key) { return true; }
            if let Some(table) = after.as_deref_mut() {
                if let Some(column) = change.addr.col.checked_sub(table.range.start.col)
                    .filter(|column| (*column as usize) < table.calculated_columns.len()) {
                    table.calculated_columns[column as usize] = Some(
                        crate::TableColumnFormula::new(change.addr.row, &change.after)
                            .expect("formula rewrite preserves a valid template"));
                }
            }
            false
        });
    }

    pub fn validate(&self, workbook: &Workbook, undo: bool) -> Result<(), &'static str> {
        let expected = if undo { &self.after } else { &self.before };
        let current = if let Some(key) = &self.table_key {
            workbook.tables.get(key).and_then(|table| {
                // 删除前面的工作表会移动索引，模板所属表的稳定身份不能跟着失效。
                let owner = workbook.index_of(table.sheet_name())?;
                if workbook.sheet_key(owner) != Some(self.sheet_key) { return None; }
                let column = self.addr.col.checked_sub(table.range.start.col)? as usize;
                let formula = table.calculated_columns.get(column)?.as_ref()?;
                (formula.row() == self.addr.row).then(|| formula.formula().to_owned())
            })
        } else {
            (workbook.sheet_key(self.sheet) == Some(self.sheet_key))
                .then(|| workbook.sheets[self.sheet].formula_text_at(self.addr)).flatten()
        };
        if current.as_ref() != Some(expected) {
            return Err("A referring formula changed outside history.");
        }
        Ok(())
    }

    pub fn apply(&self, workbook: &mut Workbook, undo: bool) {
        let source = if undo { &self.before } else { &self.after };
        if let Some(key) = &self.table_key {
            let table = workbook.tables.get_mut(key).expect("validated template owner");
            let column = (self.addr.col - table.range.start.col) as usize;
            table.calculated_columns[column] = Some(
                crate::TableColumnFormula::new(self.addr.row, source)
                    .expect("formula rewrite preserves a valid template"));
            workbook.tables_epoch = workbook.tables_epoch.wrapping_add(1);
            return;
        }
        // 包含停放公式；恢复源码走现有依赖安装路径，不把计算结果存成值。
        workbook.sheets[self.sheet].restore_formula_source(self.addr, source);
    }

    pub fn retained_bytes(&self) -> usize {
        self.before.len() + self.after.len() + self.table_key.as_ref().map_or(0, String::len)
            + std::mem::size_of::<Self>()
    }
}
