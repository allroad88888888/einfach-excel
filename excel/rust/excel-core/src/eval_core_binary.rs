use super::*;

pub(super) fn eval_binop(op: BinOperator, left: &Value, right: &Value) -> Value {
    // Propagate errors
    if let Value::Error(e) = left {
        return Value::Error(e.clone());
    }
    if let Value::Error(e) = right {
        return Value::Error(e.clone());
    }

    // Concat is the only string-yielding op; handle separately so we don't
    // require both sides to be numeric.
    if let BinOperator::Concat = op {
        return Value::Text(format!("{}{}", coerce_to_text(left), coerce_to_text(right)));
    }

    // Comparisons accept mixed types and return Boolean. Numeric comparison
    // when both sides are numeric, otherwise lexicographic on display text.
    let is_cmp = matches!(
        op,
        BinOperator::Eq
            | BinOperator::NotEq
            | BinOperator::Lt
            | BinOperator::LtEq
            | BinOperator::Gt
            | BinOperator::GtEq
    );
    if is_cmp {
        return Value::Boolean(eval_compare(op, left, right));
    }

    // 算术专用的转换：比 `coerce_to_number` 多认数值字符串（`=1+"5"` → 6）。
    let ln = coerce_to_number_arith(left);
    let rn = coerce_to_number_arith(right);

    match (ln, rn) {
        (Some(l), Some(r)) => match op {
            BinOperator::Add => finite_or_overflow(l + r),
            BinOperator::Sub => finite_or_overflow(l - r),
            BinOperator::Mul => finite_or_overflow(l * r),
            BinOperator::Div => {
                if r == 0.0 {
                    Value::Error(ValueError::DivisionByZero)
                } else {
                    finite_or_overflow(l / r)
                }
            }
            BinOperator::Pow => {
                let result = l.powf(r);
                if result.is_finite() {
                    Value::Number(result)
                } else if l == 0.0 && r < 0.0 {
                    Value::Error(ValueError::DivisionByZero) // 0^negative
                } else {
                    Value::Error(ValueError::Overflow)
                }
            }
            // Concat / comparisons handled above
            _ => Value::Error(ValueError::InvalidValue),
        },
        // Arithmetic op with a non-numeric (non-coercible) operand.
        //
        // Excel reports this as `#VALUE!` (`=1+"x"`, `="x"+"y"`), and there
        // is no `#TYPE!` code in Excel at all. `WrongType` stays reserved
        // for the non-Excel diagnostics the engine deliberately keeps
        // (built-in argument-type validation, custom-formula marshaling —
        // see `CUSTOM_FORMULAS.md`); leaking it out of the arithmetic
        // operators made every cross-engine parity check against the TS
        // reference engine diverge on a plain `=1+"x"`.
        _ => Value::Error(ValueError::InvalidValue),
    }
}

/// 算术结果的出口闸门：**非有限一律 `#NUM!`**。
///
/// Excel 明文按 IEEE 754 存数，但在两个点上刻意不跟：溢出（"Overflow occurs
/// when a number is too large to be represented. Excel uses its own special
/// representation for this case (`#NUM!`)"）与 NaN（"Excel instead immediately
/// generates an error such as `#NUM!` or `#DIV/0!`"）—— 见 Microsoft Learn
/// "Floating-point arithmetic may give inaccurate result in Excel"。所以
/// `=1E308*10` 不是 `inf`（Rust `Display`）也不是 `Infinity`（JS `String`），
/// 是 `#NUM!`。
///
/// **下溢不在这条闸门里**：同一份文档写明 "Underflow ... In IEEE and Excel,
/// the result is 0"，而 IEEE 的下溢结果本来就是 `0.0`，`is_finite()` 判真、
/// 原样落地。`=1E-308/1E10` 要的就是 `0`，不要在这里替它报错。
///
/// `Pow` 不走这里：它要把 `0^负数` 单独分流成 `#DIV/0!`（Excel 的答案），
/// 判非有限之后还得再分一次类，所以保留自己的分支。
pub(super) fn finite_or_overflow(n: f64) -> Value {
    if n.is_finite() {
        Value::Number(n)
    } else {
        Value::Error(ValueError::Overflow)
    }
}


pub(super) fn eval_compare(op: BinOperator, l: &Value, r: &Value) -> bool {
    let cmp = if let (Some(ln), Some(rn)) = (coerce_to_number(l), coerce_to_number(r)) {
        ln.partial_cmp(&rn)
    } else {
        coerce_to_text(l).partial_cmp(&coerce_to_text(r))
    };
    let cmp = match cmp {
        Some(c) => c,
        // NaN-vs-anything: only Eq compares true if both are NaN values; we
        // already covered numeric NaN via partial_cmp returning None — treat
        // as not-equal for inequality ops.
        None => return matches!(op, BinOperator::NotEq),
    };
    use std::cmp::Ordering::*;
    match (op, cmp) {
        (BinOperator::Eq, Equal) => true,
        (BinOperator::NotEq, Equal) => false,
        (BinOperator::NotEq, _) => true,
        (BinOperator::Lt, Less) => true,
        (BinOperator::LtEq, Less | Equal) => true,
        (BinOperator::Gt, Greater) => true,
        (BinOperator::GtEq, Greater | Equal) => true,
        _ => false,
    }
}

/// Evaluate a binop operand with array-aware semantics.
///
/// Standard `eval_expr_with_provider` collapses a bare `Expr::Range` to
/// `#VALUE!` (ranges are only meaningful as function args), and lets a
/// `Value::Array` from a constructor function (`SEQUENCE`, `={1;2;3}`)
/// flow through as-is. For implicit broadcast we want the OPPOSITE
/// behaviour at the binop boundary: a multi-cell range becomes a
/// `Value::Array`, but a single-cell range collapses to its scalar so
/// `=A1+1` keeps the scalar-arithmetic fast path.
pub(super) fn eval_operand_for_binop(expr: &Expr, provider: &dyn EvalProvider) -> Value {
    match runtime_ref_from_expr(expr, provider) {
        Ok(r) => return runtime_ref_to_value(&r, provider),
        Err(ValueError::InvalidValue) => {}
        Err(e) => return Value::Error(e),
    }
    // Non-range operand: defer to the normal evaluator. `Value::Array`
    // results (constant-array literals, SEQUENCE, etc.) flow through and
    // trigger broadcast at the call site.
    eval_expr_with_provider(expr, provider)
}
