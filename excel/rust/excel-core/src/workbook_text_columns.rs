//! 原生分列计划：读取完整源列，检查目标，返回有界预览；此处不写工作簿。
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::text_columns::{split_text_columns, TextColumnsMode};
use crate::text_columns_value::{TextColumnRule, TextColumnType, TextColumnValue};
use crate::text_columns_number::TextColumnsNumberOptions;
use crate::{CellAddress, CellRange, Sheet, Workbook};
use einfach_core::Value;

const MAX_CELLS: usize = 100_000;
const MAX_BYTES: usize = 32 * 1024 * 1024;
pub const TEXT_COLUMNS_PREVIEW_ROWS: usize = 20;
pub const TEXT_COLUMNS_PREVIEW_COLS: usize = 12;
pub const TEXT_COLUMNS_PREVIEW_CHARS: usize = 120;

#[derive(Clone, Debug)]
pub struct TextColumnsRequest {
    pub sheet: usize,
    pub source: CellRange,
    pub destination: CellAddress,
    pub mode: TextColumnsMode,
    pub column_types: Vec<TextColumnRule>,
    pub number_options: Option<TextColumnsNumberOptions>,
    /// 宿主画布边界；不能把输出写到当前界面无法访问的位置。
    pub row_count: u32,
    pub col_count: u32,
}

#[derive(Debug, PartialEq, Eq)]
pub struct TextColumnsPreview {
    pub source_column_count: usize,
    pub target: CellRange,
    /// 原地拆分不把源列本身当成额外覆盖；移到其它位置时则完整检查目标。
    pub overwritten_cells: usize,
    pub sample: Vec<Vec<String>>,
    /// 行／列／长字段任一受预览上限影响即为 true；实际写入从不截断。
    pub sample_truncated: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub struct TextColumnsReport {
    pub target: CellRange,
    pub changed_cells: usize,
}

pub(crate) struct TextColumnsPlan {
    pub source_column_count: usize,
    pub target: CellRange,
    pub overwritten_cells: usize,
    pub fields: Vec<Vec<TextColumnValue>>,
}

impl Workbook {
    pub fn preview_text_columns(
        &self,
        request: &TextColumnsRequest,
    ) -> Result<TextColumnsPreview, &'static str> {
        let plan = self.plan_text_columns(request);
        // 与工作簿其它公开读取一致：预览产生的公式读取不能拖慢下一次编辑。
        self.store.settle_pending_reads();
        let plan = plan?;
        let mut truncated = plan.fields.len() > TEXT_COLUMNS_PREVIEW_ROWS
            || plan.target.cols() as usize > TEXT_COLUMNS_PREVIEW_COLS;
        let sample = plan
            .fields
            .iter()
            .take(TEXT_COLUMNS_PREVIEW_ROWS)
            .map(|row| {
                row.iter()
                    .take(TEXT_COLUMNS_PREVIEW_COLS)
                    .map(|field| {
                        let display = field.display();
                        let mut chars = display.chars();
                        let sample = chars.by_ref().take(TEXT_COLUMNS_PREVIEW_CHARS).collect();
                        truncated |= chars.next().is_some();
                        sample
                    })
                    .collect()
            })
            .collect();
        Ok(TextColumnsPreview {
            source_column_count: plan.source_column_count,
            target: plan.target,
            overwritten_cells: plan.overwritten_cells,
            sample,
            sample_truncated: truncated,
        })
    }

    pub(crate) fn plan_text_columns(
        &self,
        request: &TextColumnsRequest,
    ) -> Result<TextColumnsPlan, &'static str> {
        let TextColumnsRequest {
            sheet,
            source,
            destination,
            mode,
            column_types,
            number_options,
            row_count,
            col_count,
        } = request;
        mode.validate()?;
        if let Some(options) = number_options { options.validate()?; }
        let mut rules = std::collections::BTreeMap::new();
        for rule in column_types {
            if rule.column >= EXCEL_MAX_COLS as usize || rules.insert(rule.column, rule.kind).is_some() {
                return Err("Invalid or duplicate source field type.");
            }
        }
        if *row_count == 0
            || *row_count > EXCEL_MAX_ROWS
            || *col_count == 0
            || *col_count > EXCEL_MAX_COLS
        {
            return Err("Invalid worksheet dimensions.");
        }
        let sheet = self.sheet(*sheet).ok_or("Worksheet no longer exists.")?;
        if source.start.col != source.end.col
            || source.start.row > source.end.row
            || source.end.row >= *row_count
            || source.end.col >= *col_count
        {
            return Err("Select a single column within the worksheet.");
        }
        let rows = source.rows() as usize;
        if rows > MAX_CELLS {
            return Err("Split exceeds 100,000 cells. Choose a smaller range.");
        }
        if destination.row >= *row_count
            || destination.col >= *col_count
            || rows as u32 > row_count - destination.row
        {
            return Err("Split output exceeds the worksheet boundary.");
        }
        check_geometry(sheet, *source)?;
        let mut fields = Vec::with_capacity(rows);
        let mut columns = 1usize;
        let mut bytes = 0usize;
        // 一次冻结完整源数据（含隐藏行），不能边读取边覆盖重叠目标。
        for address in source.iter() {
            let text = match sheet.peek_value(address) {
                Value::Text(text) => text,
                Value::Number(value) => value.to_string(),
                Value::Boolean(value) => if value { "TRUE" } else { "FALSE" }.into(),
                Value::Null => String::new(),
                _ => return Err("Cannot split an error or non-scalar value."),
            };
            let row = split_text_columns(&text, mode)?;
            bytes += row.iter().map(String::len).sum::<usize>();
            columns = columns.max(row.len());
            if bytes > MAX_BYTES || rows * columns > MAX_CELLS {
                return Err("Split exceeds 100,000 cells or 32 MiB. Choose a smaller range.");
            }
            fields.push(row);
        }
        if rules.keys().any(|column| *column >= columns) {
            return Err("A column type refers to a missing source field.");
        }
        let output_columns = columns - rules.values().filter(|kind| **kind == TextColumnType::Skip).count();
        if output_columns == 0 { return Err("Keep at least one source field."); }
        if output_columns as u32 > col_count - destination.col {
            return Err("Split output exceeds the worksheet boundary.");
        }
        let target = CellRange::new(
            *destination,
            CellAddress::new(
                destination.row + rows as u32 - 1,
                destination.col + output_columns as u32 - 1,
            ),
        );
        check_geometry(sheet, target)?;
        let mut overwritten_cells = 0;
        for address in target.iter() {
            if *destination == source.start && source.contains(address) {
                continue;
            }
            // 公式返回空串仍是已有内容；格式本身不算内容覆盖。
            if sheet.has_formula_at(address) || sheet.peek_value(address) != Value::Null {
                overwritten_cells += 1;
            }
        }
        // 读取可能使惰性数组公式展开；检查最终几何，不能只看求值前的缓存。
        check_geometry(sheet, *source)?;
        check_geometry(sheet, target)?;
        let fields = fields.into_iter().map(|mut row| {
            row.resize(columns, String::new());
            row.into_iter().enumerate().filter_map(|(column, text)| {
                let kind = rules.get(&column).copied();
                (kind != Some(TextColumnType::Skip)).then(|| TextColumnValue::parse(text, kind, *number_options))
            }).collect()
        }).collect();
        Ok(TextColumnsPlan {
            source_column_count: columns,
            target,
            overwritten_cells,
            fields,
        })
    }
}

fn check_geometry(sheet: &Sheet, range: CellRange) -> Result<(), &'static str> {
    if sheet
        .merged_ranges()
        .iter()
        .any(|merged| merged.intersects(range))
    {
        return Err("Unmerge the source and destination before splitting text.");
    }
    if sheet.spill_intersecting(range).is_some() {
        return Err("Cannot split text through a spilled array.");
    }
    Ok(())
}
