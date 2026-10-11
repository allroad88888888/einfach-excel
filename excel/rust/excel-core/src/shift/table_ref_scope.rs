//! Table 转换/列改名共用的调用位置判断；跨区域规则和闭包不能固定成某一个单元格。
use crate::eval::ResolvedTable;
use crate::formula::{BinOperator, Expr, RangeAbs, RangeBounds, RefAbs};
use crate::CellRange;

pub(super) fn table_address(table: &ResolvedTable, range: CellRange, abs: RefAbs) -> Expr {
    if range.start == range.end {
        Expr::SheetRef {
            sheet: table.sheet_name.clone(),
            addr: range.start,
            abs,
        }
    } else {
        Expr::SheetRange {
            sheet: table.sheet_name.clone(),
            start: range.start,
            end: range.end,
            unbounded: RangeBounds::None,
            abs: RangeAbs::new(abs, abs),
        }
    }
}

pub(super) fn table_position(table: &ResolvedTable, function: &str, range: CellRange) -> Expr {
    call(
        function,
        vec![table_address(table, range, RefAbs::new(true, true))],
    )
}

pub(super) fn within_table_axis(table: &ResolvedTable, function: &str, range: CellRange) -> Expr {
    call(
        "AND",
        vec![
            binary(
                BinOperator::GtEq,
                call(function, vec![]),
                table_position(table, function, range),
            ),
            binary(
                BinOperator::Lt,
                call(function, vec![]),
                binary(
                    BinOperator::Add,
                    table_position(table, function, range),
                    // 区域起点加长度随插删一起位移，避免单独边界格被删除后产生 #REF!。
                    table_position(
                        table,
                        if function == "ROW" { "ROWS" } else { "COLUMNS" },
                        range,
                    ),
                ),
            ),
        ],
    )
}

/// 原 Table 范围内使用改写结果；其它位置仍解析各自 Table 的裸引用。
pub(super) fn scoped_table_reference(table: &ResolvedTable, changed: Expr, original: Expr) -> Expr {
    let condition = call(
        "AND",
        vec![
            binary(
                BinOperator::Eq,
                call("SHEET", vec![]),
                table_position(table, "SHEET", table.range),
            ),
            within_table_axis(table, "ROW", table.range),
            within_table_axis(table, "COLUMN", table.range),
        ],
    );
    call("IF", vec![condition, changed, original])
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
