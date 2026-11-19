//! SUBTOTAL reads direct worksheet records and ignores nested subtotal formulas.
use super::*;

pub(super) fn for_each_subtotal_argument(
    arg: &Expr,
    provider: &dyn EvalProvider,
    policy: SubtotalHiddenPolicy,
    output: &mut dyn FnMut(Value),
) {
    let mut hidden_by_sheet: Vec<(Option<usize>, SubtotalHiddenSets)> = Vec::new();
    let mut is_hidden = |sheet_index: Option<usize>, row: u32| -> bool {
        if let Some((_, rows)) = hidden_by_sheet
            .iter()
            .find(|(cached, _)| *cached == sheet_index)
        {
            return rows.contains(row);
        }
        let rows = subtotal_hidden_for_sheet(provider, policy, sheet_index);
        let result = rows.contains(row);
        hidden_by_sheet.push((sheet_index, rows));
        result
    };
    match arg {
        Expr::Sheet3DRef {
            start_sheet,
            end_sheet,
            addr,
            ..
        } => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                output(Value::Error(ValueError::InvalidRef));
                return;
            }
            let range = CellRange::new(*addr, *addr);
            provider.for_each_sheet_3d_range_cell_with_sheet(
                start_sheet,
                end_sheet,
                range,
                &mut |sheet_index, cell_addr, value| {
                    if is_hidden(sheet_index, cell_addr.row)
                        || provider.cell_formula_contains_subtotal(sheet_index, cell_addr)
                    {
                        return;
                    }
                    output(value);
                },
            );
            return;
        }
        Expr::Sheet3DRange {
            start_sheet,
            end_sheet,
            start,
            end,
            ..
        } => {
            if crate::shift::contains_invalid_ref(arg) {
                output(Value::Error(ValueError::InvalidRef));
                return;
            }
            let range = CellRange::new(*start, *end);
            provider.for_each_sheet_3d_range_cell_with_sheet(
                start_sheet,
                end_sheet,
                range,
                &mut |sheet_index, cell_addr, value| {
                    if is_hidden(sheet_index, cell_addr.row)
                        || provider.cell_formula_contains_subtotal(sheet_index, cell_addr)
                    {
                        return;
                    }
                    output(value);
                },
            );
            return;
        }
        _ => {}
    }
    for_each_arg_value_with_reference(
        arg,
        provider,
        &mut |reference, address, _position, value| {
            let Some(address) = address else {
                output(value);
                return;
            };
            let sheet = reference.and_then(|reference| reference.sheet.as_deref());
            let sheet_index = match sheet {
                Some(sheet) => provider.sheet_index_of(sheet),
                None => provider.current_sheet_index(),
            };
            if is_hidden(sheet_index, address.row) {
                return;
            }
            if reference.is_some_and(|source| source.materialized.is_none())
                && provider.cell_formula_contains_subtotal(sheet_index, address)
            {
                return;
            }
            output(value);
        },
    );
}

pub(crate) fn formula_source_contains_subtotal(source: &str) -> bool {
    // The source precheck avoids parsing unrelated formulas. The AST distinguishes
    // an actual SUBTOTAL call from a name, cell label, or string argument.
    source
        .as_bytes()
        .windows(b"SUBTOTAL".len())
        .any(|part| part.eq_ignore_ascii_case(b"SUBTOTAL"))
        && crate::formula::parse_formula(source).is_some_and(|expr| expr_contains_subtotal(&expr))
}

pub(crate) fn expr_contains_subtotal(expr: &Expr) -> bool {
    match expr {
        Expr::FuncCall { name, args } => {
            name == "SUBTOTAL" || args.iter().any(expr_contains_subtotal)
        }
        Expr::BinOp { left, right, .. } => {
            expr_contains_subtotal(left) || expr_contains_subtotal(right)
        }
        Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
            expr_contains_subtotal(inner)
        }
        Expr::DynamicRange { start, end } => {
            expr_contains_subtotal(start) || expr_contains_subtotal(end)
        }
        Expr::Call(callee, args) => {
            expr_contains_subtotal(callee) || args.iter().any(expr_contains_subtotal)
        }
        Expr::ArrayLit { data, .. } | Expr::MultiArea(data) => {
            data.iter().any(expr_contains_subtotal)
        }
        _ => false,
    }
}
