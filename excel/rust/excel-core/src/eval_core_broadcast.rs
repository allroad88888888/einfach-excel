use super::*;

/// Predicate gating the broadcast path in `Expr::BinOp`. Only true for a
/// concrete `Value::Array`; scalars (including a collapsed 1×1 range)
/// keep the scalar arithmetic path.
pub(super) fn is_array_like(v: &Value) -> bool {
    matches!(v, Value::Array(_))
}

/// Pick the element of an operand that corresponds to output cell
/// `(i, j)` under Excel broadcast rules.
///
/// - Scalar → returned as-is (broadcasts to every output cell).
/// - Array shape `(1, N)` → row 0, column `j`.
/// - Array shape `(M, 1)` → row `i`, column 0.
/// - Array shape matching the output → row `i`, column `j`.
/// - Out-of-shape access (caller passed a mismatched index) → `#VALUE!`.
pub(super) fn pick_for_broadcast(v: &Value, i: u32, j: u32) -> Value {
    match v {
        Value::Array(arr) => {
            let (rows, cols) = arr.shape();
            let r = if rows == 1 { 0 } else { i };
            let c = if cols == 1 { 0 } else { j };
            arr.get(r, c)
                .cloned()
                .unwrap_or(Value::Error(ValueError::InvalidValue))
        }
        other => other.clone(),
    }
}

/// Compute the broadcast output shape for a binary op on operands `l`
/// and `r`. Returns `None` if the shapes are not compatible:
///   - identical → that shape
///   - one scalar, one array → array's shape
///   - 1×N and N×1 (either order) → N×N outer-product shape
///   - row × row of same width, col × col of same height → that shape
///   - otherwise → incompatible.
///
/// Excel surfaces incompatible shapes as `#N/A`; we use the closest
/// available variant, `#VALUE!` (InvalidValue).
pub(super) fn broadcast_shape(l: &Value, r: &Value) -> Option<(u32, u32)> {
    let lshape = match l {
        Value::Array(a) => Some(a.shape()),
        _ => None,
    };
    let rshape = match r {
        Value::Array(a) => Some(a.shape()),
        _ => None,
    };
    match (lshape, rshape) {
        (None, None) => Some((1, 1)),
        (Some(s), None) => Some(s),
        (None, Some(s)) => Some(s),
        (Some((lr, lc)), Some((rr, rc))) => {
            if lr == rr && lc == rc {
                Some((lr, lc))
            } else if lr == 1 && rc == 1 {
                // 1×N · M×1  → M×N outer product.
                Some((rr, lc))
            } else if lc == 1 && rr == 1 {
                // M×1 · 1×N → M×N outer product.
                Some((lr, rc))
            } else if lr == 1 && lc == rc {
                // row vector broadcast down a multi-row array.
                Some((rr, rc))
            } else if rr == 1 && rc == lc {
                Some((lr, lc))
            } else if lc == 1 && lr == rr {
                // column vector broadcast across a multi-col array.
                Some((rr, rc))
            } else if rc == 1 && rr == lr {
                Some((lr, lc))
            } else {
                None
            }
        }
    }
}

/// Apply a binary arithmetic op pointwise under broadcast. Errors at
/// individual cells stay in the result array (Excel parity — a single
/// `#DIV/0!` in `=A1:A3/B1:B3` only poisons one output cell, not the
/// whole spill).
pub(super) fn broadcast_binop(op: BinOperator, l: Value, r: Value) -> Value {
    // Whole-operand errors (e.g. `#REF!` from a malformed range) bypass
    // broadcast and propagate scalar-style, matching how `eval_binop`
    // treats an error operand.
    if let Value::Error(e) = &l {
        return Value::Error(e.clone());
    }
    if let Value::Error(e) = &r {
        return Value::Error(e.clone());
    }
    let (rows, cols) = match broadcast_shape(&l, &r) {
        Some(s) => s,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let cap = match checked_array_len(rows as u64, cols as u64) {
        Ok(cap) => cap,
        Err(e) => return Value::Error(e),
    };
    let mut out: Vec<Value> = Vec::with_capacity(cap);
    for i in 0..rows {
        for j in 0..cols {
            let lv = pick_for_broadcast(&l, i, j);
            let rv = pick_for_broadcast(&r, i, j);
            // Per-cell evaluation reuses the scalar code path. Errors
            // stay in-array — this is the documented behaviour.
            out.push(eval_binop(op, &lv, &rv));
        }
    }
    Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
}
