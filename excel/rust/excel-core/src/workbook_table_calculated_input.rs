//! 计算列输入复用单格公式校验；标准公式与整列前后像作为一条 Table 历史提交。
use super::*;
use crate::cell_input::{parse_formatted_input, CellInput};
use crate::workbook_history::MAX_BYTES;
use crate::{CellSnapshot, TableColumnFormula};

impl TableDefinitionChange {
    pub(crate) fn prepare_calculated_input(
        workbook: &Workbook, sheet: usize, addr: CellAddress, input: &str,
    ) -> Result<Option<Self>, String> {
        let sheet_name = workbook.name(sheet).ok_or("INVALID_SHEET")?;
        let Some(table) = workbook.tables.values().find(|table| {
            table.sheet_name() == sheet_name && table.range().contains(addr)
        }) else { return Ok(None); };
        Self::prepare_calculated_column(workbook, sheet, addr, input, table)
    }

    /// 已有列与即将扩出的列共用预检；只读取给定定义，不先修改注册表。
    pub(super) fn prepare_calculated_column(
        workbook: &Workbook, sheet: usize, addr: CellAddress, input: &str, table: &TableEntry,
    ) -> Result<Option<Self>, String> {
        let target = workbook.sheet(sheet).ok_or("INVALID_SHEET")?;
        if !table.range().contains(addr)
            || (table.has_headers() && addr.row == table.range().start.row)
            || (table.has_totals() && addr.row == table.range().end.row) {
            return Ok(None);
        }
        let CellInput::Formula(source) = parse_formatted_input(
            input, true, &target.get_format(&addr.to_string()).number_format,
        ) else { return Ok(None); };
        let column = (addr.col - table.range.start.col) as usize;
        let range = CellRange::new(
            CellAddress::new(table.range.start.row + u32::from(table.has_headers), addr.col),
            CellAddress::new(table.range.end.row - u32::from(table.has_totals), addr.col),
        );
        let previous = table.calculated_columns.get(column).and_then(Option::as_ref);
        // 先只看稀疏已有格决定是否整列写入，不为普通单格输入复制整列历史。
        let mut occupied = 0;
        let mut eligible = true;
        target.for_each_non_empty_in_range(range, &mut |cell| {
            occupied += 1;
            if let Some(previous) = previous {
                let normalized = target.formula_text_at(cell).and_then(|source| parse_formula(&source))
                    .map(|expr| crate::shift::render_formula(&expr));
                eligible &= normalized == previous.formula_at(cell.row).ok();
            } else { eligible &= cell == addr; }
        });
        // 全空列可以重新建立标准公式；局部缺项仍是例外，不能因编辑别行而填回。
        if !eligible || (previous.is_some() && occupied > 0 && occupied != range.rows()) {
            return Ok(None);
        }
        validate_cells(workbook, sheet, range)?;
        let mut formula = TableColumnFormula::new(addr.row, &source)?;
        if let Some(previous) = previous {
            if previous.formula_at(addr.row)? == formula.formula() {
                formula = previous.clone();
            }
        }
        // 在创建逐行源码前检查既有历史预算；不先分配百万条再拒绝。
        if range.rows() as usize * 64 > MAX_BYTES {
            return Err("Filling this calculated column exceeds the 32 MiB undo budget.".into());
        }
        let before_cells = HistorySnapshot::capture(target, range, true);
        let mut after = table.clone();
        after.calculated_columns.resize(after.columns.len(), None);
        after.calculated_columns[column] = Some(formula.clone());
        let mut after_cells = before_cells.clone();
        after_cells.cells = None;
        let mut cells = Vec::new();
        let mut bytes = before_cells.retained_bytes() + after_cells.retained_bytes()
            + crate::sheet::metadata_bytes(table) + crate::sheet::metadata_bytes(&after);
        for row in range.start.row..=range.end.row {
            let source = formula.formula_at(row)?;
            bytes += 96 + source.len();
            if bytes > MAX_BYTES {
                return Err("Filling this calculated column exceeds the 32 MiB undo budget.".into());
            }
            cells.push(CellSnapshot::formula(CellAddress::new(row, addr.col), source));
        }
        after_cells.cells = Some(cells);
        Ok(Some(Self {
            sheet, range, before: table.clone(), after: Some(after),
            formulas: Vec::new(), rules: Vec::new(), lambdas: Vec::new(),
            cells: vec![(before_cells, after_cells)],
            filter: None,
        }))
    }

    pub(crate) fn apply_calculated_input(&mut self, workbook: &mut Workbook) -> Result<bool, String> {
        if self.after.as_ref() == Some(&self.before) && self.cells.iter().all(|(a, b)| a == b) {
            return Ok(false);
        }
        let arrays = workbook.array_dependents_for_range(self.sheet, self.range);
        let observers: Vec<_> = workbook.sheets.iter_mut()
            .map(Sheet::suspend_structure_notifications).collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            // 整列是同一次替换：先移除旧依赖，避免旧公式把合法的新依赖误判为循环。
            workbook.clear_range(self.sheet, self.range);
            let planned = self.cells[0].1.cells.as_ref().unwrap();
            result = workbook.set_table_formulas(self.sheet, planned);
            // 列内公式可能依赖后面的行，必须在所有源码安装后校验最终值。
            if result.is_ok() {
                result = planned.iter().try_for_each(|cell| {
                    let value = crate::sheet::collapse_array_for_eval(
                        workbook.sheets[self.sheet].peek_value(cell.addr));
                    workbook.validate_input_value(self.sheet, cell.addr, &value)
                });
            }
            if result.is_ok() {
                // 保存实际写入后的稀疏格式/行高，而不是保留预检的假想结果。
                self.cells[0].1 = HistorySnapshot::capture(&workbook.sheets[self.sheet], self.range, true);
                if self.retained_bytes() > MAX_BYTES {
                    result = Err("Filling this calculated column exceeds the 32 MiB undo budget.");
                }
            }
            if result.is_err() {
                self.cells[0].0.restore(workbook, self.sheet)
                    .expect("calculated-column input keeps its original worksheet");
            } else {
                let after = self.after.as_ref().unwrap();
                workbook.tables.insert(after.name().to_ascii_uppercase(), after.clone());
                // 几何没变：不失效整份 Table 引用，由所写单元格的 atom 自己传播。
                workbook.tables_epoch = workbook.tables_epoch.wrapping_add(1);
            }
        });
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result.map(|_| true).map_err(str::to_string)
    }
}

impl Workbook {
    /// 自动填充与新行继承共用；调用者必须提供整个动作的回滚边界。
    pub(in crate::workbook) fn set_table_formulas(
        &mut self, sheet: usize, cells: &[CellSnapshot],
    ) -> Result<(), &'static str> {
        if self.is_inside_custom_call() { return Err("MUTATION_DURING_CUSTOM_CALL"); }
        let parsed = cells.iter().map(|cell| {
            parse_formula(cell.formula.as_ref().expect("table formula plan"))
                .ok_or("INVALID_FORMULA")
        }).collect::<Result<Vec<_>, _>>()?;
        // 复用惰性装载，不在逐格安装期间投影数组；Text 格式不改变公式语义。
        self.sheets[sheet].bulk_load(|loader| {
            for cell in cells {
                loader.set_formula_at(cell.addr, cell.formula.as_ref().unwrap());
            }
        });
        // 所有源码已落地，现有静态检查才能同时看到本次新增的依赖边。
        for (cell, expr) in cells.iter().zip(&parsed) {
            if self.closes_workbook_cycle(sheet, cell.addr, expr) { return Err("FORMULA_CYCLE"); }
        }
        self.sheets[sheet].project_bulk_spill_anchors(cells.iter().map(|cell| cell.addr).collect());
        if cells.iter().any(|cell| self.sheets[sheet].is_spill_region(cell.addr)
            || self.sheets[sheet].blocked_anchor_shape(cell.addr).is_some()) {
            return Err("Spilled arrays cannot be entered inside a table.");
        }
        Ok(())
    }
}
