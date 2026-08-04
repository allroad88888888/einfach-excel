use super::*;

/// Concrete lambda payload used by the formula evaluator. The `params`
/// vec stores parameter names (in declaration order); `body` is the AST
/// the LAMBDA literal wraps; `captured` is the snapshot of LET bindings
/// visible when the lambda literal was evaluated. Owned by an `Arc` at
/// the `Value::Lambda` boundary so clones are cheap (lambdas pass
/// through array higher-order functions and get cloned per call).
#[derive(Debug)]
pub(crate) struct ExcelLambda {
    pub params: Vec<String>,
    pub body: Expr,
    pub captured: Vec<(String, Value)>,
}

impl LambdaValue for ExcelLambda {
    fn arity(&self) -> usize {
        self.params.len()
    }
    fn param_names(&self) -> &[String] {
        &self.params
    }
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

/// Apply a lambda value to a positional argument list. Returns
/// `WrongType` if the value isn't a lambda (or a downcast fails), and
/// `WrongArgCount` on arity mismatch. The body is evaluated against a
/// fresh LET frame seeded with the lambda's captured bindings PLUS the
/// new parameter bindings (parameters shadow same-named captured
/// bindings).
///
/// Errors from the body propagate out as-is. The frame is popped via a
/// guard so the LET stack stays balanced even when the body
/// short-circuits.
/// 可选实参「取默认值」的判定：这个槽位**在语法上根本没写东西**吗。
///
/// 看的是语法（`Expr::Omitted`）而不是求值结果 —— 这是一条刻意的选择，
/// 而且**与 TS 引擎不同**（`eval/functions/array.ts::isOmittedArg` 看的是
/// `value.kind === 'blank'`）。理由：
///
/// 1. Excel 的「取默认值」规则key 在「参数没提供」上。指向空格的引用是
///    **提供了**一个值，它在数值语境下强转成 0 —— `=SEQUENCE(3,1,F11)`
///    （F11 是空格）在 Excel 里是 0/1/2，不是 1/2/3。
/// 2. 按值判会让**不含 `,,` 的公式**也改行为，超出本次修复的范围。
///    `tests/golden_replay.rs` 的漂移哨兵当场抓到过这一点（seed 11
///    第 853 行就是上面那条 `SEQUENCE`）—— 那次是按值判的版本。
///
/// 代价是「空格引用喂给可选参数」这一类两个引擎仍不同答案，逐条钉在
/// `excel/solid-excel/test/cross-engine-parity-omitted-args.test.ts` 的
/// 已知分歧组里。Rust 这一侧与 Excel 一致。
///
/// 只用在**可选**参数上。必填参数写成空占位仍按空值参与运算
/// （`=SUM(1,,2)` 是 3，不是「少了一个参数」）。
pub(super) fn arg_is_omitted(expr: &Expr) -> bool {
    matches!(expr, Expr::Omitted)
}

pub(crate) fn apply_lambda(lambda: &Value, args: Vec<Value>, provider: &dyn EvalProvider) -> Value {
    let arc = match lambda {
        Value::Lambda(a) => a.clone(),
        Value::Error(e) => return Value::Error(e.clone()),
        _ => return Value::Error(ValueError::WrongType),
    };
    let excel_lambda = match arc.as_any().downcast_ref::<ExcelLambda>() {
        Some(l) => l,
        None => return Value::Error(ValueError::WrongType),
    };
    // 实参**多于**形参仍是错误。实参**少于**形参不是 —— Excel 允许尾部
    // 形参不传，体内用 `ISOMITTED(形参)` 分流；没传的形参绑成空值。
    // 与 TS 引擎 `buildLambdaContext` 同一条（那边也只挡 `args.length >
    // params.length`）。
    if args.len() > excel_lambda.params.len() {
        return Value::Error(ValueError::WrongArgCount);
    }
    // Build the activation frame: start with the captured snapshot, then
    // overwrite/append each parameter binding. Parameters with the same
    // name as a captured binding shadow it (Excel parity — `LAMBDA(x,
    // ...)` body sees the new `x`, not the outer LET's `x`).
    let mut frame_bindings: Vec<(String, Value)> = excel_lambda.captured.clone();
    let mut omitted_params: HashSet<String> = HashSet::new();
    let mut args_iter = args.into_iter();
    for name in excel_lambda.params.iter() {
        let value = match args_iter.next() {
            Some(v) => v,
            None => {
                omitted_params.insert(name.clone());
                Value::Null
            }
        };
        if let Some(slot) = frame_bindings.iter_mut().find(|(n, _)| n == name) {
            slot.1 = value;
        } else {
            frame_bindings.push((name.clone(), value));
        }
    }
    // Wrap body eval in the named-call depth guard. Each lambda
    // application — whether triggered by `Expr::Call`, `eval_named_call`,
    // or one of the higher-order callers (MAP / REDUCE / SCAN / BYROW /
    // BYCOL / MAKEARRAY) — bumps the depth by one and restores it on
    // return. The cap (`MAX_NAMED_CALL_DEPTH`) only bites when bodies
    // recursively call back into `apply_lambda`; the sequential per-element
    // dispatch inside MAP/REDUCE oscillates depth between N and N+1, so
    // legitimate array work isn't blocked. Recursion overflow surfaces as
    // `#NUM!` (Excel parity for stack-busting recursion).
    let depth = NAMED_CALL_DEPTH.with(|c| c.get());
    if depth >= MAX_NAMED_CALL_DEPTH {
        return Value::Error(ValueError::Overflow);
    }
    NAMED_CALL_DEPTH.with(|c| c.set(depth + 1));
    push_lambda_frame(frame_bindings, omitted_params);
    // Save/restore-style guard equivalent: any early-return from the
    // body still has the pop executed because we route everything
    // through the closure below.
    let result = eval_expr_with_provider(&excel_lambda.body, provider);
    pop_let_frame();
    NAMED_CALL_DEPTH.with(|c| c.set(depth));
    result
}

pub(super) fn apply_lambda_for_array_cell(
    lambda: &Value,
    args: Vec<Value>,
    provider: &dyn EvalProvider,
) -> Result<Value, ValueError> {
    let value = apply_lambda(lambda, args, provider);
    match value {
        Value::Array(_) | Value::Lambda(_) => Err(ValueError::Calc),
        other => Ok(other),
    }
}
