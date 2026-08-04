//! Dispatches aggregate core formula functions.

use super::*;

pub(super) fn eval_fn_aggregate_core(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"SUM" => {
            // Real streaming: O(1) accumulator, no Vec allocation. Errors
            // short-circuit through `err`.
            let mut total = 0.0_f64;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => total += n,
                        Value::Null => {}
                        Value::Boolean(true) => total += 1.0,
                        Value::Boolean(false) => {}
                        Value::Text(_) => {}
                        // Unreachable: for_each_arg_value flattens Array
                        // sub-expressions into per-element callbacks.
                        Value::Array(_) => {}
                        // A lambda landing in SUM is a type error (the user
                        // wrote `=SUM(LAMBDA(x, x))`-style nonsense). Match
                        // Excel: surface #VALUE!.
                        Value::Lambda(_) => err = Some(ValueError::WrongType),
                    }
                });
            }
            match err {
                Some(e) => Value::Error(e),
                // 累加器同样会溢出（`=SUM(A1:A2)` 上两个 1E308）。出口共用
                // `finite_or_overflow`，否则「运算符报 `#NUM!`、聚合吐 `inf`」
                // 又是同一个引擎里的两种答案。
                None => finite_or_overflow(total),
            }
        }

        "AVERAGE" => {
            let mut total = 0.0_f64;
            let mut count = 0u64;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            total += n;
                            count += 1;
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if count == 0 {
                Value::Error(ValueError::DivisionByZero)
            } else {
                Value::Number(total / count as f64)
            }
        }

        "COUNT" => {
            let mut count = 0u64;
            for arg in args {
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if matches!(v, Value::Number(_)) {
                        count += 1;
                    }
                });
            }
            Value::Number(count as f64)
        }

        "MIN" => {
            let mut min: Option<f64> = None;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            min = Some(min.map_or(n, |m: f64| m.min(n)));
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            // Empty set: Excel returns 0 if there are no numeric arguments
            // at all — but #NUM! in some versions. We prefer #VALUE! over a
            // misleading 0 (B.6). Callers wanting "0 default" should pass it.
            min.map_or(Value::Error(ValueError::InvalidValue), Value::Number)
        }

        "MAX" => {
            let mut max: Option<f64> = None;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            max = Some(max.map_or(n, |m: f64| m.max(n)));
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            max.map_or(Value::Number(0.0), Value::Number)
        }

        // === Logical ===
        "COUNTA" => {
            // Count of args that come back as anything other than Null.
            // Errors and booleans both count (Excel semantics).
            let mut count = 0u64;
            for arg in args {
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if !matches!(v, Value::Null) {
                        count += 1;
                    }
                });
            }
            Value::Number(count as f64)
        }
        "COUNTBLANK" => {
            // 恰好 1 个实参（Excel 的签名就是单区域；两个实参是 #VALUE!）。
            //
            // **闭式，不物化空格**：稀疏 provider 的 `for_each_range_cell` 只发
            // 非空格，所以「回调里数 Null」永远数不到真正的空格 —— `A:A` 会答 0。
            // 改成拿区域的**矩形格数**减掉**发出来的格子数**：差额就是稀疏遍历
            // 跳过的空格，一个都不用访问。`COUNTBLANK(A:A)` 于是是两次减法，
            // 而不是一百万次迭代。
            //
            // 发出来的格子里还要再挑出「算空」的那些：Excel 的 COUNTBLANK 把
            // **公式算出的空文本 `""` 也算空**（COUNTA 却把它算作非空 —— 两者
            // 不是互补关系）。错误格不算空。
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut emitted = 0u64;
            let mut blank_among_emitted = 0u64;
            let extent = for_each_arg_value_positioned(&args[0], provider, &mut |_pos, v| {
                emitted += 1;
                if value_counts_as_blank(&v) {
                    blank_among_emitted += 1;
                }
            });
            // 非区域实参（标量 / 数组字面量）没有洞，只数发出来的那些。
            let skipped = extent.unwrap_or(emitted).saturating_sub(emitted);
            Value::Number((skipped + blank_among_emitted) as f64)
        }

        // === B3: trig (radians) ===
        "SUBTOTAL" => fn_subtotal(args, provider),
        "AGGREGATE" => fn_aggregate(args, provider),
                _ => unreachable!(),
    }
}
