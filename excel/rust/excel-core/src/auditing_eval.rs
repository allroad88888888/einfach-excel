//! Step-by-step formula evaluation (Evaluate Formula / 公式求值) engine.

use einfach_core::{Value, ValueError};

use crate::cell::CellAddress;
use crate::eval::{eval_expr_with_provider, EvalProvider};
use crate::formula::{parse_formula, BinOperator, Expr, RangeAbs, RangeBounds};
use crate::shift::render_formula;
use crate::workbook::Workbook;

/// One evaluation step in Excel's "Evaluate Formula" (公式求值) dialog.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FormulaEvalStep {
    pub expression_before: String,
    pub focus_span: (usize, usize),
    pub step_result: String,
    pub expression_after: String,
    pub step_in_target: Option<(usize, String, CellAddress)>,
}

/// Complete step-by-step evaluation trace for a worksheet cell.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FormulaEvaluationTrace {
    pub sheet_index: usize,
    pub sheet_name: String,
    pub addr: CellAddress,
    pub formula: String,
    pub is_formula: bool,
    pub steps: Vec<FormulaEvalStep>,
    pub final_result: String,
    pub is_error: bool,
}

const MAX_EVAL_STEPS: usize = 128;

pub(crate) fn evaluate_cell_formula_steps(
    wb: &Workbook,
    sheet_index: usize,
    addr: CellAddress,
) -> FormulaEvaluationTrace {
    let sheet_name = wb.name(sheet_index).map(str::to_string).unwrap_or_default();
    let final_val = if sheet_name.is_empty() {
        Value::Null
    } else {
        wb.get_cell(&sheet_name, &addr.to_string())
    };
    let scalar_final = collapse_top_left(&final_val);
    let final_result = crate::value_to_display(&scalar_final);
    let is_error = matches!(scalar_final, Value::Error(_));

    let Some(formula_text) = wb.sheet(sheet_index).and_then(|s| s.formula_text_at(addr)) else {
        return FormulaEvaluationTrace {
            sheet_index,
            sheet_name,
            addr,
            formula: final_result.clone(),
            is_formula: false,
            steps: Vec::new(),
            final_result,
            is_error,
        };
    };

    let Some(mut current_expr) = parse_formula(&formula_text) else {
        return FormulaEvaluationTrace {
            sheet_index,
            sheet_name,
            addr,
            formula: formula_text,
            is_formula: true,
            steps: Vec::new(),
            final_result,
            is_error,
        };
    };

    let provider = wb.auditing_eval_provider(sheet_index, Some(addr));
    let mut steps = Vec::new();

    for _ in 0..MAX_EVAL_STEPS {
        let mut scan_id = 0usize;
        let Some(target_id) = find_next_redex(&current_expr, &mut scan_id) else {
            break;
        };

        let mut render_id = 0usize;
        let mut expression_before = String::from("=");
        let focus_span = render_expr_with_focus(
            &current_expr,
            Some(target_id),
            &mut render_id,
            0,
            false,
            &mut expression_before,
        )
        .unwrap_or((1, expression_before.len()));

        let mut replace_id = 0usize;
        let mut step_out = None;
        current_expr = replace_redex(
            &current_expr,
            target_id,
            &mut replace_id,
            &provider,
            wb,
            sheet_index,
            &mut step_out,
        );

        let mut after_id = 0usize;
        let mut expression_after = String::from("=");
        let _ = render_expr_with_focus(
            &current_expr,
            None,
            &mut after_id,
            0,
            false,
            &mut expression_after,
        );

        if let Some((step_result, step_in_target)) = step_out {
            steps.push(FormulaEvalStep {
                expression_before,
                focus_span,
                step_result,
                expression_after,
                step_in_target,
            });
        } else {
            break;
        }
    }

    wb.settle_auditing_reads();

    FormulaEvaluationTrace {
        sheet_index,
        sheet_name,
        addr,
        formula: formula_text,
        is_formula: true,
        steps,
        final_result,
        is_error,
    }
}

pub(crate) fn collapse_top_left(val: &Value) -> Value {
    match val {
        Value::Array(arr) => arr.get(0, 0).cloned().unwrap_or(Value::Null),
        other => other.clone(),
    }
}

fn is_range_node(expr: &Expr) -> bool {
    matches!(expr, Expr::Range { .. } | Expr::SheetRange { .. } | Expr::Sheet3DRef { .. } | Expr::Sheet3DRange { .. } | Expr::MultiArea(_))
}

fn arg_preserves_cell_ref(func_name: &str, arg_index: usize) -> bool {
    match func_name {
        "ROW" | "COLUMN" | "ROWS" | "COLUMNS" | "AREAS" | "FORMULATEXT" | "ISFORMULA"
        | "OFFSET" | "INDEX" => arg_index == 0,
        "CELL" => arg_index == 1,
        _ => false,
    }
}

fn find_next_redex(expr: &Expr, id: &mut usize) -> Option<usize> {
    let my_id = *id;
    *id += 1;

    match expr {
        Expr::Number(_) | Expr::Text(_) | Expr::Bool(_) | Expr::Error(_) | Expr::Omitted | Expr::ArrayLit { .. } => None,
        Expr::CellRef(..) | Expr::SheetRef { .. } | Expr::Sheet3DRef { .. } | Expr::Sheet3DRange { .. } | Expr::Name(_) | Expr::SheetName { .. } | Expr::TableRef { .. } | Expr::Range { .. } | Expr::SheetRange { .. } => Some(my_id),
        Expr::SpillRef(inner) | Expr::Negate(inner) | Expr::Percent(inner) => {
            if matches!(expr, Expr::SpillRef(_)) && matches!(inner.as_ref(), Expr::CellRef(..) | Expr::SheetRef { .. }) {
                count_subtree(inner, id);
                return Some(my_id);
            }
            find_next_redex(inner, id).or(Some(my_id))
        }
        Expr::BinOp { left, right, .. } | Expr::DynamicRange { start: left, end: right } => {
            if let Some(found) = find_next_redex(left, id) {
                count_subtree(right, id);
                return Some(found);
            }
            find_next_redex(right, id).or(Some(my_id))
        }
        Expr::FuncCall { name, args } => {
            if name == "LET" || name == "LAMBDA" {
                args.iter().for_each(|a| count_subtree(a, id));
                return Some(my_id);
            }
            if name == "IF" && !args.is_empty() {
                if let Some(found) = find_next_redex(&args[0], id) {
                    args[1..].iter().for_each(|a| count_subtree(a, id));
                    return Some(found);
                }
                let branch_idx = match &args[0] {
                    Expr::Bool(true) => Some(1usize),
                    Expr::Bool(false) => Some(2usize),
                    Expr::Number(n) if *n != 0.0 => Some(1usize),
                    Expr::Number(_) => Some(2usize),
                    _ => None,
                };
                for (i, a) in args.iter().enumerate().skip(1) {
                    if Some(i) == branch_idx && !is_range_node(a) {
                        if let Some(found) = find_next_redex(a, id) {
                            args[i + 1..].iter().for_each(|r| count_subtree(r, id));
                            return Some(found);
                        }
                    } else {
                        count_subtree(a, id);
                    }
                }
                return Some(my_id);
            }
            for (idx, a) in args.iter().enumerate() {
                let preserve = is_range_node(a)
                    || (arg_preserves_cell_ref(name, idx) && matches!(a, Expr::CellRef(..) | Expr::SheetRef { .. }));
                if preserve {
                    count_subtree(a, id);
                } else if let Some(found) = find_next_redex(a, id) {
                    args[idx + 1..].iter().for_each(|r| count_subtree(r, id));
                    return Some(found);
                }
            }
            Some(my_id)
        }
        Expr::Call(callee, args) => {
            if let Some(found) = find_next_redex(callee, id) {
                args.iter().for_each(|a| count_subtree(a, id));
                return Some(found);
            }
            for (idx, a) in args.iter().enumerate() {
                if let Some(found) = find_next_redex(a, id) {
                    args[idx + 1..].iter().for_each(|r| count_subtree(r, id));
                    return Some(found);
                }
            }
            Some(my_id)
        }
        Expr::MultiArea(parts) => {
            parts.iter().for_each(|p| count_subtree(p, id));
            Some(my_id)
        }
    }
}

fn count_subtree(expr: &Expr, id: &mut usize) {
    *id += 1;
    count_children_only(expr, id);
}

fn count_children_only(expr: &Expr, id: &mut usize) {
    match expr {
        Expr::BinOp { left, right, .. } | Expr::DynamicRange { start: left, end: right } => {
            count_subtree(left, id);
            count_subtree(right, id);
        }
        Expr::Negate(inner) | Expr::Percent(inner) | Expr::SpillRef(inner) => count_subtree(inner, id),
        Expr::FuncCall { args, .. } | Expr::MultiArea(args) => args.iter().for_each(|a| count_subtree(a, id)),
        Expr::Call(callee, args) => {
            count_subtree(callee, id);
            args.iter().for_each(|a| count_subtree(a, id));
        }
        _ => {}
    }
}

fn range_expr_for_sheet(wb: &Workbook, current_idx: usize, target_sheet: String, start: CellAddress, end: CellAddress) -> Expr {
    if wb.name(current_idx).unwrap_or_default() == target_sheet {
        Expr::Range { start, end, unbounded: RangeBounds::None, abs: RangeAbs::REL }
    } else {
        Expr::SheetRange { sheet: target_sheet, start, end, unbounded: RangeBounds::None, abs: RangeAbs::REL }
    }
}

fn replace_redex(
    expr: &Expr,
    target_id: usize,
    id: &mut usize,
    provider: &dyn EvalProvider,
    wb: &Workbook,
    sheet_index: usize,
    out: &mut Option<(String, Option<(usize, String, CellAddress)>)>,
) -> Expr {
    let my_id = *id;
    *id += 1;

    if my_id == target_id {
        count_children_only(expr, id);
        let step_in = resolve_step_in_target(expr, wb, sheet_index);
        if let Expr::Name(name) = expr {
            if let Ok(Some((target_sheet, range))) = wb.named_range(name) {
                let rep = range_expr_for_sheet(wb, sheet_index, target_sheet, range.start, range.end);
                *out = Some((render_formula(&rep)[1..].to_string(), step_in));
                return rep;
            }
        }
        if let Expr::TableRef { table, area, columns } = expr {
            if let Some((t_idx, range)) = wb.resolve_auditing_table_ref(sheet_index, provider.current_cell(), table.as_deref(), *area, columns.as_ref()) {
                let sheet_name = wb.name(t_idx).unwrap_or_default().to_string();
                let rep = range_expr_for_sheet(wb, sheet_index, sheet_name, range.start, range.end);
                *out = Some((render_formula(&rep)[1..].to_string(), None));
                return rep;
            }
        }
        let val = eval_expr_with_provider(expr, provider);
        let (lit_expr, display) = value_to_literal_expr(&val);
        *out = Some((display, step_in));
        return lit_expr;
    }

    match expr {
        Expr::BinOp { op, left, right } => Expr::BinOp {
            op: *op,
            left: Box::new(replace_redex(left, target_id, id, provider, wb, sheet_index, out)),
            right: Box::new(replace_redex(right, target_id, id, provider, wb, sheet_index, out)),
        },
        Expr::DynamicRange { start, end } => Expr::DynamicRange {
            start: Box::new(replace_redex(start, target_id, id, provider, wb, sheet_index, out)),
            end: Box::new(replace_redex(end, target_id, id, provider, wb, sheet_index, out)),
        },
        Expr::Negate(inner) => Expr::Negate(Box::new(replace_redex(inner, target_id, id, provider, wb, sheet_index, out))),
        Expr::Percent(inner) => Expr::Percent(Box::new(replace_redex(inner, target_id, id, provider, wb, sheet_index, out))),
        Expr::SpillRef(inner) => Expr::SpillRef(Box::new(replace_redex(inner, target_id, id, provider, wb, sheet_index, out))),
        Expr::FuncCall { name, args } => Expr::FuncCall {
            name: name.clone(),
            args: args.iter().map(|a| replace_redex(a, target_id, id, provider, wb, sheet_index, out)).collect(),
        },
        Expr::Call(callee, args) => Expr::Call(
            Box::new(replace_redex(callee, target_id, id, provider, wb, sheet_index, out)),
            args.iter().map(|a| replace_redex(a, target_id, id, provider, wb, sheet_index, out)).collect(),
        ),
        Expr::MultiArea(parts) => Expr::MultiArea(
            parts.iter().map(|p| replace_redex(p, target_id, id, provider, wb, sheet_index, out)).collect(),
        ),
        other => other.clone(),
    }
}

fn resolve_step_in_target(expr: &Expr, wb: &Workbook, sheet_index: usize) -> Option<(usize, String, CellAddress)> {
    match expr {
        Expr::CellRef(addr, _) => Some((sheet_index, wb.name(sheet_index)?.to_string(), *addr)),
        Expr::SheetRef { sheet, addr, .. } => {
            let idx = wb.index_of(sheet)?;
            Some((idx, wb.name(idx)?.to_string(), *addr))
        }
        Expr::Name(name) => {
            let (sheet_name, range) = wb.named_range(name).ok().flatten()?;
            (range.start == range.end).then(|| wb.index_of(&sheet_name).map(|idx| (idx, sheet_name, range.start))).flatten()
        }
        _ => None,
    }
}

fn value_to_literal_expr(val: &Value) -> (Expr, String) {
    match val {
        Value::Number(n) => (Expr::Number(*n), crate::value_to_display(val)),
        Value::Text(s) => {
            let expr = Expr::Text(s.clone());
            let rendered = render_formula(&expr)[1..].to_string();
            (expr, rendered)
        }
        Value::Boolean(b) => (Expr::Bool(*b), if *b { "TRUE".into() } else { "FALSE".into() }),
        Value::Error(e) => (Expr::Error(e.clone()), e.to_string()),
        Value::Null => (Expr::Number(0.0), "0".into()),
        Value::Array(arr) => {
            let (rows, cols) = arr.shape();
            let mut data = Vec::with_capacity((rows as usize) * (cols as usize));
            for r in 0..rows {
                for c in 0..cols {
                    let item = arr.get(r, c).cloned().unwrap_or(Value::Null);
                    data.push(value_to_literal_expr(&item).0);
                }
            }
            let expr = Expr::ArrayLit { rows, cols, data };
            let rendered = render_formula(&expr)[1..].to_string();
            (expr, rendered)
        }
        Value::Lambda(_) => (Expr::Error(ValueError::Calc), ValueError::Calc.to_string()),
    }
}

fn binop_prec(op: BinOperator) -> u8 {
    match op {
        BinOperator::Eq | BinOperator::NotEq | BinOperator::Lt | BinOperator::LtEq | BinOperator::Gt | BinOperator::GtEq => 1,
        BinOperator::Concat => 2,
        BinOperator::Add | BinOperator::Sub => 3,
        BinOperator::Mul | BinOperator::Div => 4,
        BinOperator::Pow => 5,
    }
}

fn render_expr_with_focus(
    expr: &Expr,
    target_id: Option<usize>,
    id: &mut usize,
    parent_prec: u8,
    right_operand: bool,
    out: &mut String,
) -> Option<(usize, usize)> {
    let my_id = *id;
    *id += 1;
    let start = out.len();
    let mut found = None;

    match expr {
        Expr::BinOp { op, left, right } => {
            let prec = binop_prec(*op);
            let need_parens = prec < parent_prec
                || (prec == parent_prec && right_operand && matches!(op, BinOperator::Sub | BinOperator::Div | BinOperator::Pow));
            if need_parens {
                out.push('(');
            }
            found = render_expr_with_focus(left, target_id, id, prec, false, out).or(found);
            out.push_str(match op {
                BinOperator::Add => " + ",
                BinOperator::Sub => " - ",
                BinOperator::Mul => " * ",
                BinOperator::Div => " / ",
                BinOperator::Pow => "^",
                BinOperator::Concat => " & ",
                BinOperator::Eq => " = ",
                BinOperator::NotEq => " <> ",
                BinOperator::Lt => " < ",
                BinOperator::LtEq => " <= ",
                BinOperator::Gt => " > ",
                BinOperator::GtEq => " >= ",
            });
            found = render_expr_with_focus(right, target_id, id, prec, true, out).or(found);
            if need_parens {
                out.push(')');
            }
        }
        Expr::Negate(inner) => {
            out.push('-');
            found = render_expr_with_focus(inner, target_id, id, 6, false, out).or(found);
        }
        Expr::Percent(inner) => {
            found = render_expr_with_focus(inner, target_id, id, 6, false, out).or(found);
            out.push('%');
        }
        Expr::SpillRef(inner) => {
            found = render_expr_with_focus(inner, target_id, id, 7, false, out).or(found);
            out.push('#');
        }
        Expr::DynamicRange { start: s, end: e } => {
            found = render_expr_with_focus(s, target_id, id, 7, false, out).or(found);
            out.push(':');
            found = render_expr_with_focus(e, target_id, id, 7, true, out).or(found);
        }
        Expr::FuncCall { name, args } => {
            out.push_str(name);
            out.push('(');
            for (i, a) in args.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                found = render_expr_with_focus(a, target_id, id, 0, false, out).or(found);
            }
            out.push(')');
        }
        Expr::Call(callee, args) => {
            out.push('(');
            found = render_expr_with_focus(callee, target_id, id, 0, false, out).or(found);
            out.push_str(")(");
            for (i, a) in args.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                found = render_expr_with_focus(a, target_id, id, 0, false, out).or(found);
            }
            out.push(')');
        }
        Expr::MultiArea(parts) => {
            out.push('(');
            for (i, p) in parts.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                found = render_expr_with_focus(p, target_id, id, 0, false, out).or(found);
            }
            out.push(')');
        }
        leaf => out.push_str(&render_formula(leaf)[1..]),
    }

    let end = out.len();
    if target_id == Some(my_id) { Some((start, end)) } else { found }
}
