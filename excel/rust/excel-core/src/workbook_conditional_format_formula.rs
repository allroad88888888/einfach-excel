//! 公式条件以作用范围左上角为原点，复用原生引用平移与公式求值。
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use super::*;
use crate::cell_style::CellStyle;
use crate::shift::shift_copy_formula;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FormulaRuleJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    formula: String,
    format: Highlight,
}

pub(crate) struct FormulaRule {
    expression: Expr,
    pub(super) enabled: bool,
    pub(super) style: CellStyle,
}

impl FormulaRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: FormulaRuleJson = serde_json::from_str(json)
            .map_err(|_| "Use a formula rule with supported highlight fields.")?;
        if rule.kind != "formula" || rule.formula.trim().is_empty() {
            return Err("Enter a conditional formula.");
        }
        let expression =
            parse_formula(rule.formula.trim()).ok_or("Enter a valid conditional formula.")?;
        shift_copy_formula(&expression, 0, 0)
            .map_err(|_| "This conditional formula cannot be translated across the range.")?;
        Ok(Self {
            expression,
            enabled: rule.enabled,
            style: rule.format.into_style()?,
        })
    }

    pub(super) fn matches(
        &self,
        book: &Workbook,
        sheet: usize,
        origin: CellAddress,
        address: CellAddress,
    ) -> bool {
        if !self.enabled {
            return false;
        }
        let Ok(expression) = shift_copy_formula(
            &self.expression,
            i64::from(address.row) - i64::from(origin.row),
            i64::from(address.col) - i64::from(origin.col),
        ) else {
            return false;
        };
        let provider = WorkbookEvalProvider {
            wb: book,
            current: Cell::new(sheet),
            current_cell: Cell::new(Some(address)),
        };
        let value = eval_expr_with_provider(&expression, &provider);
        // 错误、空白、文本不命中；IFERROR 可在公式内显式处理错误。
        let scalar = match &value {
            Value::Array(array) => array.get(0, 0),
            _ => Some(&value),
        };
        match scalar {
            Some(Value::Boolean(value)) => *value,
            Some(Value::Number(value)) => value.is_finite() && *value != 0.0,
            _ => false,
        }
    }
}
