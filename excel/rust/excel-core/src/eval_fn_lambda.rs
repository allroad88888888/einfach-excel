//! Dispatches lambda formula functions.

use super::*;

pub(super) fn eval_fn_lambda(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {
        // LET is the first arm so the LET frame is pushed/popped before
        // any other dispatch can resolve a bare `Expr::Name` against
        // the stack. L1 of the LAMBDA arc; LAMBDA / MAP / REDUCE come
        // later.
        //
        //   LET(name1, value1, name2, value2, ..., expression)
        //
        // Total arg count must be odd and ≥ 3 (at least one binding +
        // a body). Bindings are LEXICAL and SEQUENTIAL: each value can
        // see the bindings declared earlier in the same LET, and a
        // nested LET sees outer bindings through the frame chain.
        "LET" => {
            if args.len() < 3 || args.len() % 2 == 0 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let body = args.last().unwrap();
            let pairs = &args[..args.len() - 1];

            // Push a fresh frame, then bind sequentially. Each value
            // expression is evaluated WITH the current scope (so later
            // bindings can reference earlier ones), and an error from
            // any value propagates out — we still pop the frame via a
            // guard so the stack stays balanced.
            //
            // We don't reject names that shadow built-in function names
            // (e.g. `LET(SUM, 5, SUM)`). Excel rejects this with #NAME?
            // but the spec for this commit allows skipping that check;
            // a future tightening can compare against the dispatch
            // table here. A non-`Expr::Name` in a name slot is the only
            // structural rejection — caught below.
            LET_FRAMES.with(|frames| frames.borrow_mut().push(LetFrame::new()));

            let result = (|| {
                let mut i = 0;
                while i < pairs.len() {
                    let binding_name = match &pairs[i] {
                        Expr::Name(n) => n.clone(),
                        _ => return Value::Error(ValueError::InvalidName),
                    };
                    let value = eval_expr_with_provider(&pairs[i + 1], provider);
                    if let Value::Error(e) = &value {
                        return Value::Error(e.clone());
                    }
                    LET_FRAMES.with(|frames| {
                        frames
                            .borrow_mut()
                            .last_mut()
                            .expect("LET frame just pushed")
                            .bind(binding_name, value);
                    });
                    i += 2;
                }
                eval_expr_with_provider(body, provider)
            })();

            LET_FRAMES.with(|frames| {
                frames.borrow_mut().pop();
            });
            result
        }

        // LAMBDA(param1, param2, ..., body) — produce a first-class
        // lambda value. The last argument is the body expression; every
        // preceding argument must be a bare identifier (Expr::Name) and
        // becomes a parameter name. L2 of the LAMBDA arc; immediate
        // invocation `=LAMBDA(...)(args)` is handled by Expr::Call.
        //
        // Closure capture: the lambda snapshots the current LET frames
        // at literal-evaluation time. That snapshot moves into the
        // ExcelLambda struct and is later pushed as a fresh frame when
        // `apply_lambda` evaluates the body. This is what lets
        // `=LET(n, 7, LAMBDA(x, x*n)(3))` resolve `n` to 7 — even
        // though the LET frame is popped before the lambda's body
        // would otherwise run (in this immediate-call case it doesn't
        // matter, but the contract holds for stored lambdas too).
        //
        // Error contract: 0 args → WrongArgCount (need the body at
        // least). A non-`Name` in a param slot → InvalidName. The
        // 1-arg form `=LAMBDA(body)` is allowed (zero-param lambda),
        // applied via `=LAMBDA(body)()`.
        "LAMBDA" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let body = args.last().unwrap().clone();
            let mut params: Vec<String> = Vec::with_capacity(args.len() - 1);
            for a in &args[..args.len() - 1] {
                match a {
                    Expr::Name(n) => params.push(n.clone()),
                    _ => return Value::Error(ValueError::InvalidName),
                }
            }
            let captured = snapshot_let_frames();
            let lambda = ExcelLambda {
                params,
                body,
                captured,
            };
            Value::Lambda(Arc::new(lambda))
        }

        // ISOMITTED(形参) — 只在 LAMBDA 体内有意义：调用方少传了实参时答
        // TRUE，让 `LAMBDA(x,y,IF(ISOMITTED(y),x,x+y))(5)` 走默认值分支。
        //
        // 判定的是「这个**名字**是不是没拿到实参」，不是「它的值是不是
        // 空」—— `LAMBDA(x,y,ISOMITTED(y))(5,)` 里 y 拿到了一个空占位实参，
        // 那是「传了个空值」，答 FALSE。两者的区别正是空占位 `,,` 与
        // 「参数不存在」的区别。
        //
        // LAMBDA 之外（裸公式、LET 体内）答 `#NAME?`。与 TS 引擎
        // `evaluateIsOmitted` 逐条同答案。
        "ISOMITTED" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            if !in_lambda_activation() {
                return Value::Error(ValueError::InvalidName);
            }
            if let Expr::Name(n) = &args[0] {
                if lambda_param_is_omitted(n) {
                    return Value::Boolean(true);
                }
            }
            // Evaluate the arg so any error it contains propagates
            // (Excel parity). Otherwise: FALSE.
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            Value::Boolean(false)
        }

                _ => unreachable!(),
    }
}
