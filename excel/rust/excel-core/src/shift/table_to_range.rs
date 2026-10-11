//! 将一个 Table 的引用改成普通地址；只遍历 AST，不求值或替换字符串字面量。
use crate::eval::ResolvedTable;
use crate::formula::{BinOperator, Expr, RangeAbs, RangeBounds, RefAbs, TableArea};
use crate::CellRange;
use einfach_core::ValueError;

pub(crate) struct TableToRange<'a> {
    pub name: &'a str,
    pub table: &'a ResolvedTable,
}

impl TableToRange<'_> {
    /// scope 是公式所在单格或条件规则覆盖区；保存的闭包没有固定调用位置。
    pub fn rewrite(&self, expr: &mut Expr, scope: Option<(usize, CellRange)>) -> bool {
        self.walk(expr, scope, &mut Vec::new())
    }

    fn reference(
        &self,
        area: TableArea,
        columns: Option<&(String, String)>,
        scope: Option<(usize, CellRange)>,
    ) -> Expr {
        let current = scope.map(|(_, range)| range.start);
        if area == TableArea::ThisRow
            && scope.is_none_or(|(_, range)| {
                range.start.row != range.end.row
                    && (self
                        .table
                        .reference_range(area, None, Some(range.start))
                        .is_err()
                        || self
                            .table
                            .reference_range(area, None, Some(range.end))
                            .is_err())
            })
        {
            return self.caller_row(columns);
        }
        let range = match self.table.reference_range(area, columns, current) {
            Ok(range) => range,
            Err(error) => return Expr::Error(error),
        };
        // 整区固定；ThisRow 保留行相对性，让普通复制与条件规则沿行继续平移。
        let abs = RefAbs::new(true, area != TableArea::ThisRow);
        self.address(range, abs)
    }

    fn address(&self, range: CellRange, abs: RefAbs) -> Expr {
        if range.start == range.end {
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
        }
    }

    fn position(&self, function: &str, range: CellRange) -> Expr {
        call(function, vec![self.address(range, RefAbs::new(true, true))])
    }

    /// 保存/返回的闭包在调用处取当前行，不能把定义处的行号写死。
    fn caller_row(&self, columns: Option<&(String, String)>) -> Expr {
        let Ok(data) = self.table.reference_range(TableArea::Data, None, None) else {
            return Expr::Error(ValueError::InvalidValue);
        };
        let row = call("ROW", vec![]);
        let selected = match self.table.reference_range(TableArea::Data, columns, None) {
            Ok(range) => call(
                "INDEX",
                vec![
                    self.address(range, RefAbs::new(true, true)),
                    binary(
                        BinOperator::Add,
                        binary(BinOperator::Sub, row, self.position("ROW", data)),
                        Expr::Number(1.0),
                    ),
                    Expr::Number(0.0),
                ],
            ),
            Err(error) => Expr::Error(error),
        };
        call(
            "IF",
            vec![
                self.within("ROW", data),
                selected,
                Expr::Error(ValueError::InvalidValue),
            ],
        )
    }

    fn within(&self, function: &str, range: CellRange) -> Expr {
        call(
            "AND",
            vec![
                binary(
                    BinOperator::GtEq,
                    call(function, vec![]),
                    self.position(function, range),
                ),
                binary(
                    BinOperator::Lt,
                    call(function, vec![]),
                    // 从整个区域取起点与长度，删除首/末行时区域会正常收缩，
                    // 不留下一个指向已删边界单格的 #REF!。
                    binary(
                        BinOperator::Add,
                        self.position(function, range),
                        self.position(if function == "ROW" { "ROWS" } else { "COLUMNS" }, range),
                    ),
                ),
            ],
        )
    }

    /// 原区域内用普通地址，区域外仍由当前 Table 解析裸引用（包括其它表格）。
    fn scoped_bare(&self, converted: Expr, original: Expr) -> Expr {
        let full = self.table.range;
        let condition = call(
            "AND",
            vec![
                binary(
                    BinOperator::Eq,
                    call("SHEET", vec![]),
                    self.position("SHEET", full),
                ),
                self.within("ROW", full),
                self.within("COLUMN", full),
            ],
        );
        call("IF", vec![condition, converted, original])
    }

    fn walk(
        &self,
        expr: &mut Expr,
        scope: Option<(usize, CellRange)>,
        locals: &mut Vec<String>,
    ) -> bool {
        match expr {
            Expr::Name(name)
                if name.eq_ignore_ascii_case(self.name)
                    && !locals
                        .iter()
                        .rev()
                        .any(|local| local.eq_ignore_ascii_case(name)) =>
            {
                *expr = self.reference(TableArea::Data, None, scope);
                true
            }
            Expr::TableRef {
                table,
                area,
                columns,
            } => {
                if let Some(name) = table {
                    if !name.eq_ignore_ascii_case(self.name) {
                        return false;
                    }
                } else if let Some((sheet, range)) = scope {
                    if sheet != self.table.sheet_index || !self.table.range.intersects(range) {
                        return false;
                    }
                }
                let converted = self.reference(*area, columns.as_ref(), scope);
                let context_dependent = table.is_none()
                    && scope.is_none_or(|(_, range)| {
                        !self.table.range.contains(range.start)
                            || !self.table.range.contains(range.end)
                    });
                *expr = if context_dependent {
                    self.scoped_bare(converted, expr.clone())
                } else {
                    converted
                };
                true
            }
            Expr::FuncCall { name, args }
                if name == "LET" && args.len() >= 3 && args.len() % 2 == 1 =>
            {
                let depth = locals.len();
                let last = args.len() - 1;
                let mut changed = false;
                for pair in args[..last].chunks_exact_mut(2) {
                    changed |= self.walk(&mut pair[1], scope, locals);
                    if let Expr::Name(name) = &pair[0] {
                        locals.push(name.clone());
                    }
                }
                changed |= self.walk(&mut args[last], scope, locals);
                locals.truncate(depth);
                changed
            }
            Expr::FuncCall { name, args } if name == "LAMBDA" && !args.is_empty() => {
                let depth = locals.len();
                let last = args.len() - 1;
                for param in &args[..last] {
                    if let Expr::Name(name) = param {
                        locals.push(name.clone());
                    }
                }
                let changed = self.walk(&mut args[last], None, locals);
                locals.truncate(depth);
                changed
            }
            Expr::FuncCall { args, .. }
            | Expr::MultiArea(args)
            | Expr::ArrayLit { data: args, .. } => {
                let mut changed = false;
                for arg in args {
                    changed |= self.walk(arg, scope, locals);
                }
                changed
            }
            Expr::Call(callee, args) => {
                let mut changed = self.walk(callee, scope, locals);
                for arg in args {
                    changed |= self.walk(arg, scope, locals);
                }
                changed
            }
            Expr::BinOp { left, right, .. }
            | Expr::DynamicRange {
                start: left,
                end: right,
            } => {
                let left = self.walk(left, scope, locals);
                let right = self.walk(right, scope, locals);
                left || right
            }
            Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
                self.walk(inner, scope, locals)
            }
            _ => false,
        }
    }
}

fn call(name: &str, args: Vec<Expr>) -> Expr {
    Expr::FuncCall {
        name: name.into(),
        args,
    }
}

fn binary(op: BinOperator, left: Expr, right: Expr) -> Expr {
    Expr::BinOp {
        op,
        left: Box::new(left),
        right: Box::new(right),
    }
}
