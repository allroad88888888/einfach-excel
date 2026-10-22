//! 宿主只交换原始类型；值、公式求值与原子提交始终由 Rust 持有。
mod transaction;
mod snapshot_changes;
mod rule_changes;
pub(crate) use snapshot_changes::changed_ranges;
pub(crate) use rule_changes::{conditional_ranges, validation_ranges};
use crate::{CellAddress, CellRange, Workbook};
use einfach_core::{Value, ValueError};
use serde::{Deserialize, Serialize};

pub const MAX_CELLS: usize = 4096;
pub const MAX_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum RawCellValue {
    Number { value: f64 },
    String { value: String },
    Boolean { value: bool },
    Blank,
    Error { code: String },
}

impl RawCellValue {
    pub fn into_value(self) -> Result<Value, &'static str> {
        Ok(match self {
            Self::Number { value } if value.is_finite() => Value::Number(value),
            Self::Number { .. } => return Err("NON_FINITE_NUMBER"),
            Self::String { value } => Value::Text(value),
            Self::Boolean { value } => Value::Boolean(value),
            Self::Blank => Value::Null,
            Self::Error { code } => Value::Error([
                ValueError::Null, ValueError::DivisionByZero, ValueError::NotAvailable,
                ValueError::InvalidRef, ValueError::InvalidValue, ValueError::InvalidName,
                ValueError::CyclicRef, ValueError::Overflow, ValueError::WrongType,
                ValueError::WrongArgCount, ValueError::Spill, ValueError::Calc, ValueError::Busy,
            ].into_iter().find(|value| value.to_string() == code).ok_or("INVALID_ERROR_CODE")?),
        })
    }

    fn from_value(value: Value) -> Result<Self, &'static str> {
        Ok(match value {
            Value::Number(value) => Self::Number { value },
            Value::Text(value) => Self::String { value },
            Value::Boolean(value) => Self::Boolean { value },
            Value::Error(error) => Self::Error { code: error.to_string() },
            Value::Array(array) => return Self::from_value(array.get(0, 0).cloned().unwrap_or(Value::Null)),
            Value::Null => Self::Blank,
            _ => return Err("HOST_VALUE_UNSUPPORTED"),
        })
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum HostCellInput {
    Literal { value: RawCellValue },
    Formula { formula: String },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HostCellWrite {
    pub sheet: usize,
    pub row: u32,
    pub col: u32,
    pub input: HostCellInput,
}

#[derive(Clone, Debug, Serialize)]
pub struct RawWorkbookCell {
    pub row: u32,
    pub col: u32,
    pub input: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
    pub value: RawCellValue,
}

/// 稀疏读取省略无输入的空格；公式返回当前原生值，读取会触发惰性求值。
pub fn read_range(workbook: &Workbook, sheet: usize, range: CellRange)
    -> Result<Vec<RawWorkbookCell>, &'static str>
{
    validate_range(workbook, sheet, range)?;
    let mut cells = Vec::new();
    let mut failure = None;
    let mut bytes = 0;
    workbook.for_each_sparse_range_cell(sheet, range, |addr, value| {
        if failure.is_some() { return; }
        let target = workbook.sheet(sheet).unwrap();
        if target.spill_anchor_for(addr).is_some_and(|anchor| anchor != addr) { return; }
        let formula = target.get_formula(&addr.to_string());
        let raw = match RawCellValue::from_value(value) {
            Ok(value) => value,
            Err(error) => { failure = Some(error); return; },
        };
        let input = formula.clone().unwrap_or_else(|| match &raw {
            RawCellValue::Number { value } => value.to_string(),
            RawCellValue::String { value } => value.clone(),
            RawCellValue::Boolean { value } => if *value { "TRUE" } else { "FALSE" }.into(),
            RawCellValue::Error { code } => code.clone(),
            RawCellValue::Blank => String::new(),
        });
        bytes += input.len() * 2 + 128;
        if cells.len() >= MAX_CELLS || bytes > MAX_BYTES {
            failure = Some("HOST_READ_BUDGET_EXCEEDED"); return;
        }
        cells.push(RawWorkbookCell { row: addr.row, col: addr.col, input, formula, value: raw });
    });
    if let Some(error) = failure { return Err(error); }
    cells.sort_by_key(|cell| (cell.row, cell.col));
    Ok(cells)
}

pub(crate) fn validate_range(workbook: &Workbook, sheet: usize, range: CellRange)
    -> Result<(), &'static str>
{
    if workbook.sheet(sheet).is_none() { return Err("INVALID_SHEET"); }
    if range.start.row > range.end.row || range.start.col > range.end.col
        || range.end.row >= 1_048_576 || range.end.col >= 16_384 {
        return Err("INVALID_RANGE");
    }
    Ok(())
}

pub(crate) fn address(cell: &HostCellWrite) -> CellAddress {
    CellAddress::new(cell.row, cell.col)
}
