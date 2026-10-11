//! 转普通区域时冻结 Table 外观，内容仍由原有公式重写处理。
use super::*;
use crate::workbook_history::MAX_BYTES;
use crate::{CellStyle, TableStylePreset};

impl TableDefinitionChange {
    pub(crate) fn prepare_convert(workbook: &Workbook, name: &str) -> Result<Self, String> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot convert a table during a custom call.".into());
        }
        let before = workbook
            .get_table(name)
            .ok_or("The table no longer exists.")?
            .clone();
        let sheet = workbook
            .index_of(before.sheet_name())
            .ok_or("The table worksheet no longer exists.")?;
        let cells = converted_formats(workbook, sheet, &before)?;
        let table = before.to_resolved(sheet);
        let converter = crate::shift::TableToRange {
            name: before.name(),
            table: &table,
        };
        let rewrite = |sheet, range, expr: &mut Expr| converter.rewrite(expr, Some((sheet, range)));
        let formulas = FormulaSourceChange::prepare(workbook, &rewrite);
        let rules = FormulaRuleChange::prepare(workbook, &rewrite);
        let lambdas = FormulaLambdaChange::prepare(workbook, &|expr| converter.rewrite(expr, None));
        let change = Self {
            sheet,
            range: before.range(),
            before,
            after: None,
            formulas,
            rules,
            lambdas,
            cells,
        };
        // 与既有历史共用预算，不能成功转换后因超限静默丢掉本次撤销。
        if change.retained_bytes() > MAX_BYTES {
            return Err("Converting this table exceeds the 32 MiB undo budget.".into());
        }
        Ok(change)
    }
}

fn converted_formats(
    workbook: &Workbook,
    sheet: usize,
    table: &TableEntry,
) -> Result<Vec<(HistorySnapshot, HistorySnapshot)>, String> {
    if table.style().preset == TableStylePreset::None {
        return Ok(Vec::new());
    }
    let range = table.range();
    let count = u64::from(range.rows()) * u64::from(range.cols());
    // 在分配逐格格式前用结构体大小做下界检查；生成过程中再核算字符串等实际占用。
    if count * std::mem::size_of::<(CellAddress, CellStyle)>() as u64 > MAX_BYTES as u64 {
        return Err("Converting this table exceeds the 32 MiB undo budget.".into());
    }
    let before = HistorySnapshot::capture(&workbook.sheets[sheet], range, false);
    let mut after = before.clone();
    after.formats.cell_styles.clear();
    let mut bytes = before.retained_bytes() + after.retained_bytes();
    for row in range.start.row..=range.end.row {
        for col in range.start.col..=range.end.col {
            let addr = CellAddress::new(row, col);
            let mut style = table.style().cell_style(table, addr);
            workbook.sheets[sheet].apply_base_style_at(addr, &mut style);
            bytes += std::mem::size_of::<CellAddress>() + crate::sheet::metadata_bytes(&style);
            if bytes > MAX_BYTES {
                return Err("Converting this table exceeds the 32 MiB undo budget.".into());
            }
            after.formats.cell_styles.push((addr, style));
        }
    }
    Ok(vec![(before, after)])
}
