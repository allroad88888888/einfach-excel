//! 表结构变化只扫描稀疏公式索引，改写静态表引用，绝不替换字符串字面量。
use super::*;
use crate::formula::Expr;

pub(crate) fn rewrite_sheet_refs(expr: &mut Expr, old: &str, new: Option<&str>) {
    match expr {
        Expr::SheetRef { sheet, .. } | Expr::SheetRange { sheet, .. } => {
            if sheet.eq_ignore_ascii_case(old) {
                if let Some(name) = new {
                    *sheet = name.to_string();
                } else {
                    *expr = Expr::Error(ValueError::InvalidRef);
                }
            }
        }
        Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
            rewrite_sheet_refs(inner, old, new);
        }
        Expr::BinOp { left, right, .. }
        | Expr::DynamicRange {
            start: left,
            end: right,
        } => {
            rewrite_sheet_refs(left, old, new);
            rewrite_sheet_refs(right, old, new);
        }
        Expr::FuncCall { args, .. } | Expr::MultiArea(args) => {
            for arg in args {
                rewrite_sheet_refs(arg, old, new);
            }
        }
        Expr::Call(callee, args) => {
            rewrite_sheet_refs(callee, old, new);
            for arg in args {
                rewrite_sheet_refs(arg, old, new);
            }
        }
        _ => {}
    }
}

impl Workbook {
    pub(super) fn sheet_ref_rewrites(
        &self,
        old: &str,
        new: Option<&str>,
    ) -> Vec<(usize, CellAddress, String)> {
        let range = CellRange::new(
            CellAddress::new(0, 0),
            CellAddress::new(
                crate::sheet::EXCEL_MAX_ROWS - 1,
                crate::sheet::EXCEL_MAX_COLS - 1,
            ),
        );
        let mut writes = Vec::new();
        for (idx, sheet) in self.sheets.iter().enumerate() {
            // 包含已求值及尚未解析的公式；普通值、空格不参与扫描。
            for addr in sheet.formula_addrs_in_range(range) {
                let Some(text) = sheet.formula_text_at(addr) else {
                    continue;
                };
                if !text.contains('!') {
                    continue;
                }
                let Some(mut expr) = parse_formula(&text) else {
                    continue;
                };
                let original = expr.clone();
                rewrite_sheet_refs(&mut expr, old, new);
                if expr != original {
                    writes.push((idx, addr, crate::render_formula(&expr)));
                }
            }
        }
        writes
    }
}
