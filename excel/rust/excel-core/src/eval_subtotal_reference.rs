//! SUBTOTAL reads direct worksheet records and ignores nested subtotal formulas.
use super::*;

pub(super) fn for_each_subtotal_argument(
    arg: &Expr,
    provider: &dyn EvalProvider,
    policy: SubtotalHiddenPolicy,
    output: &mut dyn FnMut(Value),
) {
    let mut hidden = None;
    for_each_arg_value_with_reference(
        arg,
        provider,
        &mut |reference, address, _position, value| {
            let Some(address) = address else {
                output(value);
                return;
            };
            let sheet = reference.and_then(|reference| reference.sheet.as_deref());
            let hidden = hidden.get_or_insert_with(|| {
                let index = match sheet {
                    Some(sheet) => provider.sheet_index_of(sheet),
                    None => provider.current_sheet_index(),
                };
                subtotal_hidden_for_sheet(provider, policy, index)
            });
            if hidden.contains(address.row) {
                return;
            }
            if reference.is_some_and(|source| source.materialized.is_none())
                && is_subtotal_formula(provider, sheet, address)
            {
                return;
            }
            output(value);
        },
    );
}

fn is_subtotal_formula(
    provider: &dyn EvalProvider,
    sheet: Option<&str>,
    address: CellAddress,
) -> bool {
    let source = match sheet {
        Some(sheet) => provider.sheet_cell_formula_text(sheet, address),
        None => provider.cell_formula_text(address),
    };
    source.is_some_and(|source| {
        // The source precheck avoids parsing unrelated formulas. The AST distinguishes
        // an actual SUBTOTAL call from a name, cell label, or string argument.
        source
            .as_bytes()
            .windows(b"SUBTOTAL".len())
            .any(|part| part.eq_ignore_ascii_case(b"SUBTOTAL"))
            && crate::formula::parse_formula(&source).is_some_and(|expr| contains_subtotal(&expr))
    })
}

fn contains_subtotal(expr: &Expr) -> bool {
    match expr {
        Expr::FuncCall { name, args } => name == "SUBTOTAL" || args.iter().any(contains_subtotal),
        Expr::BinOp { left, right, .. } => contains_subtotal(left) || contains_subtotal(right),
        Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => {
            contains_subtotal(inner)
        }
        Expr::DynamicRange { start, end } => contains_subtotal(start) || contains_subtotal(end),
        Expr::Call(callee, args) => contains_subtotal(callee) || args.iter().any(contains_subtotal),
        Expr::ArrayLit { data, .. } | Expr::MultiArea(data) => data.iter().any(contains_subtotal),
        _ => false,
    }
}
