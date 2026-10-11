//! 计算列只保存标准公式的源文本与行原点；实际值仍由单元格 atom 求值。
use crate::formula::parse_formula;
use crate::shift::{render_formula, shift_copy_formula};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "FormulaWire", into = "FormulaWire")]
pub struct TableColumnFormula {
    row: u32,
    formula: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct FormulaWire {
    row: u32,
    formula: String,
}

impl TableColumnFormula {
    /// 行原点不必是第一条记录：在列中间输入也要同时向上、向下填充。
    pub fn new(row: u32, formula: &str) -> Result<Self, &'static str> {
        if row >= crate::sheet::EXCEL_MAX_ROWS {
            return Err("Invalid calculated-column formula row.");
        }
        let expression = parse_formula(formula).ok_or("Invalid calculated-column formula.")?;
        shift_copy_formula(&expression, 0, 0)
            .map_err(|_| "This formula cannot be filled down a table column.")?;
        Ok(Self { row, formula: render_formula(&expression) })
    }

    pub fn row(&self) -> u32 { self.row }
    pub fn formula(&self) -> &str { &self.formula }

    /// 复用普通复制的相对/绝对引用规则；结构化 ThisRow 引用在目标格求值。
    pub fn formula_at(&self, row: u32) -> Result<String, &'static str> {
        if row >= crate::sheet::EXCEL_MAX_ROWS {
            return Err("Invalid calculated-column target row.");
        }
        let expression = parse_formula(&self.formula).ok_or("Invalid calculated-column formula.")?;
        let shifted = shift_copy_formula(&expression, i64::from(row) - i64::from(self.row), 0)
            .map_err(|_| "This formula cannot be filled down a table column.")?;
        Ok(render_formula(&shifted))
    }
}

impl TryFrom<FormulaWire> for TableColumnFormula {
    type Error = &'static str;
    fn try_from(wire: FormulaWire) -> Result<Self, Self::Error> {
        Self::new(wire.row, &wire.formula)
    }
}

impl From<TableColumnFormula> for FormulaWire {
    fn from(value: TableColumnFormula) -> Self {
        Self { row: value.row, formula: value.formula }
    }
}
