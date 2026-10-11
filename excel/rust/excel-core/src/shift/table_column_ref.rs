//! 列名改写保留裸引用的调用位置；条件规则跨表格、返回的 LAMBDA 都按实际位置判断。
use super::table_ref::{rewrite_table_refs, TableRefEditSpec};
use super::table_ref_scope::scoped_table_reference;
use crate::eval::ResolvedTable;
use crate::formula::Expr;
use crate::CellRange;

pub(crate) struct TableColumnRename<'a> {
    pub spec: TableRefEditSpec,
    pub table: &'a ResolvedTable,
}

impl TableColumnRename<'_> {
    pub fn rewrite(&self, expr: &mut Expr, scope: Option<(usize, CellRange)>) -> bool {
        match expr {
            Expr::TableRef { table, .. } => {
                let bare = table.is_none();
                if bare
                    && scope.is_some_and(|(sheet, range)| {
                        sheet != self.table.sheet_index || !self.table.range.intersects(range)
                    })
                {
                    return false;
                }
                let Some(changed) = rewrite_table_refs(expr, &self.spec, true) else {
                    return false;
                };
                let dynamic = bare
                    && scope.is_none_or(|(_, range)| {
                        !self.table.range.contains(range.start)
                            || !self.table.range.contains(range.end)
                    });
                *expr = if dynamic {
                    scoped_table_reference(self.table, changed, expr.clone())
                } else {
                    changed
                };
                true
            }
            Expr::FuncCall { name, args } if name == "LAMBDA" && !args.is_empty() => {
                self.rewrite(args.last_mut().unwrap(), None)
            }
            Expr::FuncCall { args, .. }
            | Expr::MultiArea(args)
            | Expr::ArrayLit { data: args, .. } => {
                let mut changed = false;
                for arg in args {
                    changed |= self.rewrite(arg, scope);
                }
                changed
            }
            Expr::Call(callee, args) => {
                let mut changed = self.rewrite(callee, scope);
                for arg in args {
                    changed |= self.rewrite(arg, scope);
                }
                changed
            }
            Expr::BinOp { left, right, .. }
            | Expr::DynamicRange {
                start: left,
                end: right,
            } => {
                let left = self.rewrite(left, scope);
                let right = self.rewrite(right, scope);
                left || right
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                self.rewrite(inner, scope)
            }
            _ => false,
        }
    }
}
