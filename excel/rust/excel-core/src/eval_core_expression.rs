use super::*;

struct AtomEvalProvider<'a> {
    get: &'a dyn Fn(AtomId) -> Value,
    cell_map: &'a HashMap<CellAddress, AtomId>,
}

impl<'a> EvalProvider for AtomEvalProvider<'a> {
    fn cell(&self, addr: CellAddress) -> Value {
        self.cell_map
            .get(&addr)
            .map(|&id| (self.get)(id))
            .unwrap_or(Value::Null)
    }

    fn sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        // Legacy shim has no workbook context — cross-sheet refs are
        // out of scope. Production cross-sheet eval lives on
        // `WorkbookEvalProvider`.
        Value::Error(ValueError::InvalidRef)
    }
}

/// Evaluate an AST expression using a getter function for cell values.
/// `cell_map` maps CellAddress to AtomId so the evaluator can look up cells.
pub fn eval_expr(
    expr: &Expr,
    get: &dyn Fn(AtomId) -> Value,
    cell_map: &HashMap<CellAddress, AtomId>,
) -> Value {
    let provider = AtomEvalProvider { get, cell_map };
    eval_expr_with_provider(expr, &provider)
}

pub fn eval_expr_with_provider(expr: &Expr, provider: &dyn EvalProvider) -> Value {
    match expr {
        Expr::Number(n) => Value::Number(*n),
        Expr::Text(s) => Value::Text(s.clone()),
        Expr::Bool(b) => Value::Boolean(*b),
        Expr::Error(e) => Value::Error(e.clone()),
        // 空占位实参（`=SUM(1,,2)`）——「传了个空值进去」，不是「这个参数
        // 不存在」。与 TS 引擎的 `case 'omitted': return BLANK` 同语义。
        Expr::Omitted => Value::Null,

        Expr::CellRef(addr, _) => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            provider.cell(*addr)
        }

        Expr::BinOp { op, left, right } => {
            // Implicit arithmetic broadcast: when either operand is a
            // multi-cell range or evaluates to a `Value::Array`, we lift
            // the binop over the array shapes (Excel parity). A single-
            // cell range collapses to a scalar before the broadcast check
            // so `=A1+1` still takes the scalar path even with a `A1:A1`
            // synonym.
            let lv = eval_operand_for_binop(left, provider);
            let rv = eval_operand_for_binop(right, provider);
            if is_array_like(&lv) || is_array_like(&rv) {
                broadcast_binop(*op, lv, rv)
            } else {
                eval_binop(*op, &lv, &rv)
            }
        }

        Expr::Negate(inner) => {
            let v = eval_expr_with_provider(inner, provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            // 一元负号走的是和二元算术运算符**同一套**强制转换，所以
            // `=-"5"` 是 `-5`、`=-TRUE` 是 `-1`、`=-A1`（A1 空）是 `0`。
            match coerce_to_number_arith(&v) {
                Some(n) => Value::Number(-n),
                // Same Excel rule as the binary arithmetic operators: a
                // failed numeric coercion under an arithmetic operator is
                // `#VALUE!`, never `#TYPE!` (a code Excel does not have).
                // `=-"abc"` 仍然落在这里。
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        Expr::Percent(inner) => {
            // 后缀 `%`：`=50%` → 0.5。与一元负号共用强制转换，所以
            // `="50"%` 是 0.5 而 `="abc"%` 是 `#VALUE!`。
            let v = eval_expr_with_provider(inner, provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number_arith(&v) {
                Some(n) => Value::Number(n / 100.0),
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        Expr::FuncCall { name, args } => eval_func(name, args, provider),

        Expr::Range { start, end, .. } | Expr::SheetRange { start, end, .. } => {
            // Ranges should be handled by function evaluators, not standalone
            // If we get here, collect all values into... just return an error
            let _ = (start, end);
            Value::Error(ValueError::InvalidValue)
        }

        Expr::SpillRef(_) | Expr::DynamicRange { .. } | Expr::TableRef { .. } => {
            // A structured reference in value context materializes its
            // resolved region as a `Value::Array` (spilling like `A1#` /
            // `A1:INDEX(...)`), or collapses to the scalar for a 1×1 region
            // (design doc §5.3 value-context arm).
            match runtime_ref_from_expr(expr, provider) {
                Ok(r) => runtime_ref_to_value(&r, provider),
                Err(e) => Value::Error(e),
            }
        }

        Expr::SheetRef { sheet, addr, .. } => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            // Formula-inner evaluation owns the workbook-scoped runtime cycle
            // guard, so recursing into an on-stack cell surfaces CyclicRef.
            provider.sheet_cell(sheet, *addr)
        }

        Expr::Name(name) => {
            // Resolution order (Excel parity):
            //   1. Active LET scope chain. Innermost LET shadows outer
            //      bindings, which in turn shadow workbook names so
            //      `=LET(answer, 1, answer)` returns 1 even when the
            //      workbook has a defined name `answer = 42`.
            //   2. Workbook defined-name registry (consulted via the
            //      provider, which returns None for non-workbook
            //      contexts).
            //   3. Otherwise `#NAME?`.
            if let Some(v) = lookup_let_binding(name) {
                return v;
            }
            if let Some(v) = provider.lookup_named(name) {
                return v;
            }
            Value::Error(ValueError::InvalidName)
        }

        Expr::Call(callee, call_args) => {
            // Immediate-application form: evaluate the callee, then apply
            // the resulting lambda to the evaluated arguments. The L2
            // entry point — `=LAMBDA(x, x*x)(5)` lands here. Argument
            // evaluation happens *outside* the lambda body so it sees the
            // CALLER's LET scope, not the lambda's captured frame
            // (matches Excel call semantics).
            let callee_value = eval_expr_with_provider(callee, provider);
            if let Value::Error(e) = &callee_value {
                return Value::Error(e.clone());
            }
            let mut arg_values: Vec<Value> = Vec::with_capacity(call_args.len());
            for a in call_args {
                let v = eval_expr_with_provider(a, provider);
                if let Value::Error(e) = &v {
                    return Value::Error(e.clone());
                }
                arg_values.push(v);
            }
            apply_lambda(&callee_value, arg_values, provider)
        }

        Expr::ArrayLit { rows, cols, data } => {
            // Excel constant-array literal: evaluate every element
            // (each is a Number / Text / Bool / Error / Negate(Number) per
            // the parser's invariant) and pack the row-major `Vec<Value>`
            // into a `Value::Array`. Error literals stay as error cells in
            // the array instead of collapsing the whole literal.
            //
            // No provider reads are needed (no cell refs inside), and
            // the resulting Array flows into the existing spill /
            // for_each_arg_value paths exactly like a SEQUENCE result
            // would.
            let mut values: Vec<Value> = Vec::with_capacity(data.len());
            for e in data {
                let is_error_literal = matches!(e, Expr::Error(_));
                let v = eval_expr_with_provider(e, provider);
                if !is_error_literal {
                    if let Value::Error(err) = v {
                        return Value::Error(err);
                    }
                }
                values.push(v);
            }
            Value::Array(Arc::new(ArrayData::new(*rows, *cols, values)))
        }

        Expr::MultiArea(_) => {
            // A multi-area reference (`(A1:B2, D5:E6)`) is NOT a scalar
            // value — it's a union of disjoint ranges that only certain
            // built-ins (AREAS at first; SUMIF / COUNTIF criteria-range
            // in advanced cases) know how to consume. Anywhere else it
            // surfaces #VALUE!, matching Excel.
            //
            // AREAS receives the unevaluated `Expr::MultiArea` directly
            // via the func-call arm (see `eval_func`); it never recurses
            // back into this branch for its argument.
            Value::Error(ValueError::InvalidValue)
        }
    }
}
