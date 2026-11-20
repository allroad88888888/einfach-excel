//! 工作簿内部跳转超链接（`#Sheet2!A1`、`#'Sales Orders'!B5:D10`、`#SampleAmounts`）校验与规范化。
use crate::formula::{parse_formula, Expr, RangeBounds};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::{render_formula, CellAddress};

pub const INVALID_INTERNAL_HYPERLINK: &str =
    "Enter a valid workbook location such as #Sheet2!A1 or #DefinedName.";

pub(super) fn normalize_internal_hyperlink(input: &str) -> Result<String, &'static str> {
    let body = input
        .strip_prefix('#')
        .map(str::trim)
        .ok_or(INVALID_INTERNAL_HYPERLINK)?;
    if body.is_empty()
        || input.len() > super::MAX_HYPERLINK_BYTES
        || input.chars().any(|c| c.is_control())
    {
        return Err(INVALID_INTERNAL_HYPERLINK);
    }
    let expr = parse_formula(&format!("={body}")).ok_or(INVALID_INTERNAL_HYPERLINK)?;
    let valid = match &expr {
        Expr::CellRef(addr, _) => in_bounds(*addr),
        Expr::Range {
            start,
            end,
            unbounded: RangeBounds::None,
            ..
        } => in_bounds(*start) && in_bounds(*end),
        Expr::SheetRef { sheet, addr, .. } => valid_sheet(sheet) && in_bounds(*addr),
        Expr::SheetRange {
            sheet,
            start,
            end,
            unbounded: RangeBounds::None,
            ..
        } => valid_sheet(sheet) && in_bounds(*start) && in_bounds(*end),
        // 带单引号而无 `!` 的输入在公式词法器里会退回 Expr::Name，这里明确拒绝。
        Expr::Name(name) => !body.starts_with('\'') && valid_defined_name(name),
        Expr::SheetName { sheet, name } => valid_sheet(sheet) && valid_defined_name(name),
        _ => false,
    };
    if !valid {
        return Err(INVALID_INTERNAL_HYPERLINK);
    }
    let rendered = render_formula(&expr);
    Ok(format!("#{}", &rendered[1..]))
}

fn in_bounds(addr: CellAddress) -> bool {
    addr.row < EXCEL_MAX_ROWS && addr.col < EXCEL_MAX_COLS
}

fn valid_sheet(sheet: &str) -> bool {
    !sheet.is_empty() && sheet.chars().count() <= 255 && !sheet.chars().any(|c| c.is_control())
}

fn valid_defined_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_alphabetic() || first == '_')
        || name.chars().count() > 255
        || !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '.')
    {
        return false;
    }
    let upper = name.to_uppercase();
    if matches!(upper.as_str(), "R" | "C" | "TRUE" | "FALSE") {
        return false;
    }
    let r1c1 = upper
        .strip_prefix('R')
        .and_then(|rest| rest.split_once('C'))
        .is_some_and(|(row, col)| {
            !row.is_empty()
                && !col.is_empty()
                && row.bytes().all(|b| b.is_ascii_digit())
                && col.bytes().all(|b| b.is_ascii_digit())
        });
    !r1c1
}
