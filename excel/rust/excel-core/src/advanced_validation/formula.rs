//! 自定义验证只求值条件表达式，单元格依赖/缓存/spill 完全由已安装的原生 Store 提供。
use super::*;
use crate::eval::eval_expr_with_provider;
use crate::shift::shift_copy_formula;

pub(super) fn accepts(
    book: &Workbook,
    sheet: usize,
    target: CellAddress,
    anchor: CellAddress,
    source: &str,
) -> bool {
    let Some(expression) = parse_formula(source.trim()) else {
        return false;
    };
    let Ok(expression) = shift_copy_formula(
        &expression,
        i64::from(target.row) - i64::from(anchor.row),
        i64::from(target.col) - i64::from(anchor.col),
    ) else {
        return false;
    };
    let provider = WorkbookEvalProvider {
        wb: book,
        current: Cell::new(sheet),
        current_cell: Cell::new(Some(target)),
    };
    // 已安装候选的依赖必须读同一个原生结果；不能重算 RAND/宿主回调或虚拟 spill。
    // 验证公式本身须返回单个真值，不把数组首元素悄悄当成整个条件。
    match eval_expr_with_provider(&expression, &provider) {
        Value::Boolean(result) => result,
        Value::Number(result) => result.is_finite() && result != 0.0,
        _ => false,
    }
}
