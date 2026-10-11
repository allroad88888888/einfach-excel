//! 将一个 Table 的引用改成普通地址；只遍历 AST，不求值或替换字符串字面量。
use crate::eval::ResolvedTable;
use crate::formula::{Expr, RangeAbs, RangeBounds, RefAbs, TableArea};
use crate::CellRange;

pub(crate) struct TableToRange<'a> {
    pub name: &'a str,
    pub table: &'a ResolvedTable,
}

impl TableToRange<'_> {
    /// scope 是公式所在单格或条件规则覆盖区；保存的闭包没有固定调用位置。
    pub fn rewrite(
        &self,
        expr: &mut Expr,
        scope: Option<(usize, CellRange)>,
    ) -> Result<bool, &'static str> {
        let mut candidate = expr.clone();
        let changed = self.walk(&mut candidate, scope, &mut Vec::new())?;
        if changed {
            *expr = candidate;
        }
        Ok(changed)
    }

    fn reference(
        &self,
        area: TableArea,
        columns: Option<&(String, String)>,
        scope: Option<(usize, CellRange)>,
    ) -> Result<Expr, &'static str> {
        let current = scope.map(|(_, range)| range.start);
        if area == TableArea::ThisRow {
            let Some((_, scope)) = scope else {
                return Err("A saved or returned LAMBDA uses a caller-relative table row; conversion is not supported yet.");
            };
            if scope.start.row != scope.end.row
                && (self
                    .table
                    .reference_range(area, columns, Some(scope.start))
                    .is_err()
                    || self
                        .table
                        .reference_range(area, columns, Some(scope.end))
                        .is_err())
            {
                return Err("A conditional table-row formula crosses the table boundary; conversion is not supported yet.");
            }
        }
        let range = match self.table.reference_range(area, columns, current) {
            Ok(range) => range,
            Err(error) => return Ok(Expr::Error(error)),
        };
        // 整区固定；ThisRow 保留行相对性，让普通复制与条件规则沿行继续平移。
        let abs = RefAbs::new(true, area != TableArea::ThisRow);
        Ok(if range.start == range.end {
            Expr::SheetRef {
                sheet: self.table.sheet_name.clone(),
                addr: range.start,
                abs,
            }
        } else {
            Expr::SheetRange {
                sheet: self.table.sheet_name.clone(),
                start: range.start,
                end: range.end,
                unbounded: RangeBounds::None,
                abs: RangeAbs::new(abs, abs),
            }
        })
    }

    fn bare_targets_table(&self, scope: Option<(usize, CellRange)>) -> Result<bool, &'static str> {
        let Some((sheet, range)) = scope else {
            return Err("A saved or returned LAMBDA uses an unqualified table reference; conversion is not supported yet.");
        };
        if sheet != self.table.sheet_index || !self.table.range.intersects(range) {
            return Ok(false);
        }
        if !self.table.range.contains(range.start) || !self.table.range.contains(range.end) {
            return Err("An unqualified conditional table reference crosses the table boundary; conversion is not supported yet.");
        }
        Ok(true)
    }

    fn walk(
        &self,
        expr: &mut Expr,
        scope: Option<(usize, CellRange)>,
        locals: &mut Vec<String>,
    ) -> Result<bool, &'static str> {
        match expr {
            Expr::Name(name)
                if name.eq_ignore_ascii_case(self.name)
                    && !locals
                        .iter()
                        .rev()
                        .any(|local| local.eq_ignore_ascii_case(name)) =>
            {
                *expr = self.reference(TableArea::Data, None, scope)?;
                Ok(true)
            }
            Expr::TableRef {
                table,
                area,
                columns,
            } => {
                let targeted = match table {
                    Some(name) => name.eq_ignore_ascii_case(self.name),
                    None => self.bare_targets_table(scope)?,
                };
                if !targeted {
                    return Ok(false);
                }
                *expr = self.reference(*area, columns.as_ref(), scope)?;
                Ok(true)
            }
            Expr::FuncCall { name, args }
                if name == "LET" && args.len() >= 3 && args.len() % 2 == 1 =>
            {
                let depth = locals.len();
                let last = args.len() - 1;
                let mut changed = false;
                for pair in args[..last].chunks_exact_mut(2) {
                    changed |= self.walk(&mut pair[1], scope, locals)?;
                    if let Expr::Name(name) = &pair[0] {
                        locals.push(name.clone());
                    }
                }
                changed |= self.walk(&mut args[last], scope, locals)?;
                locals.truncate(depth);
                Ok(changed)
            }
            Expr::FuncCall { name, args } if name == "LAMBDA" && !args.is_empty() => {
                let depth = locals.len();
                let last = args.len() - 1;
                for param in &args[..last] {
                    if let Expr::Name(name) = param {
                        locals.push(name.clone());
                    }
                }
                let changed = self.walk(&mut args[last], None, locals)?;
                locals.truncate(depth);
                Ok(changed)
            }
            Expr::FuncCall { args, .. }
            | Expr::MultiArea(args)
            | Expr::ArrayLit { data: args, .. } => {
                let mut changed = false;
                for arg in args {
                    changed |= self.walk(arg, scope, locals)?;
                }
                Ok(changed)
            }
            Expr::Call(callee, args) => {
                let mut changed = self.walk(callee, scope, locals)?;
                for arg in args {
                    changed |= self.walk(arg, scope, locals)?;
                }
                Ok(changed)
            }
            Expr::BinOp { left, right, .. }
            | Expr::DynamicRange {
                start: left,
                end: right,
            } => {
                let left = self.walk(left, scope, locals)?;
                let right = self.walk(right, scope, locals)?;
                Ok(left || right)
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                self.walk(inner, scope, locals)
            }
            _ => Ok(false),
        }
    }
}
