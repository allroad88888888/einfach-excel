//! Dispatches database formula functions.

use super::*;

pub(super) fn eval_fn_database(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"DSUM" => db_aggregate(
            args,
            provider,
            0.0_f64,
            |acc, v| {
                if let Value::Number(n) = v {
                    *acc += *n;
                }
            },
            Value::Number,
        ),
        "DAVERAGE" => db_aggregate(
            args,
            provider,
            (0.0_f64, 0u64),
            |acc, v| {
                if let Value::Number(n) = v {
                    acc.0 += *n;
                    acc.1 += 1;
                }
            },
            |(sum, count)| {
                if count == 0 {
                    Value::Error(ValueError::DivisionByZero)
                } else {
                    Value::Number(sum / count as f64)
                }
            },
        ),
        "DCOUNT" => db_aggregate(
            args,
            provider,
            0u64,
            |acc, v| {
                if matches!(v, Value::Number(_)) {
                    *acc += 1;
                }
            },
            |c| Value::Number(c as f64),
        ),
        "DCOUNTA" => db_aggregate(
            args,
            provider,
            0u64,
            |acc, v| {
                if !matches!(v, Value::Null) {
                    *acc += 1;
                }
            },
            |c| Value::Number(c as f64),
        ),
        "DMAX" => db_aggregate(
            args,
            provider,
            None::<f64>,
            |acc, v| {
                if let Value::Number(n) = v {
                    *acc = Some(acc.map_or(*n, |m| if *n > m { *n } else { m }));
                }
            },
            |opt| Value::Number(opt.unwrap_or(0.0)),
        ),
        "DMIN" => db_aggregate(
            args,
            provider,
            None::<f64>,
            |acc, v| {
                if let Value::Number(n) = v {
                    *acc = Some(acc.map_or(*n, |m| if *n < m { *n } else { m }));
                }
            },
            |opt| Value::Number(opt.unwrap_or(0.0)),
        ),
        "DPRODUCT" => db_aggregate(
            args,
            provider,
            None::<f64>,
            |acc, v| {
                if let Value::Number(n) = v {
                    *acc = Some(acc.map_or(*n, |p| p * *n));
                }
            },
            |opt| Value::Number(opt.unwrap_or(0.0)),
        ),
        "DGET" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let database = match resolve_database_range(&args[0], provider) {
                Ok(d) => d,
                Err(e) => return Value::Error(e),
            };
            let field_col = match resolve_db_field(&database, &args[1], provider) {
                Ok(c) => c,
                Err(e) => return Value::Error(e),
            };
            let mut found: Option<Value> = None;
            let mut too_many = false;
            let walk = iter_db_matches(&database, &args[2], provider, |row| {
                if too_many {
                    return Ok(());
                }
                let v = database.data_cell(row, field_col as u32, provider);
                if let Value::Error(e) = v {
                    return Err(e);
                }
                if found.is_some() {
                    too_many = true;
                } else {
                    found = Some(v);
                }
                Ok(())
            });
            if let Err(e) = walk {
                return Value::Error(e);
            }
            if too_many {
                return Value::Error(ValueError::Overflow);
            }
            found.unwrap_or(Value::Error(ValueError::InvalidValue))
        }
        "DSTDEV" | "DSTDEVP" | "DVAR" | "DVARP" => {
            // Two-pass; needs the full numeric Vec.
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let database = match resolve_database_range(&args[0], provider) {
                Ok(d) => d,
                Err(e) => return Value::Error(e),
            };
            let field_col = match resolve_db_field(&database, &args[1], provider) {
                Ok(c) => c,
                Err(e) => return Value::Error(e),
            };
            let mut nums: Vec<f64> = Vec::new();
            let walk = iter_db_matches(&database, &args[2], provider, |row| {
                let v = database.data_cell(row, field_col as u32, provider);
                if let Value::Error(e) = v {
                    return Err(e);
                }
                if let Value::Number(n) = v {
                    nums.push(n);
                }
                Ok(())
            });
            if let Err(e) = walk {
                return Value::Error(e);
            }
            // Sample (DSTDEV/DVAR) divides by n-1 and needs n >= 2.
            // Population (DSTDEVP/DVARP) divides by n and needs n >= 1.
            let is_sample = matches!(name, "DSTDEV" | "DVAR");
            let min_n = if is_sample { 2 } else { 1 };
            if nums.len() < min_n {
                return Value::Error(ValueError::DivisionByZero);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let denom = if is_sample {
                (nums.len() - 1) as f64
            } else {
                nums.len() as f64
            };
            let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / denom;
            let result = if name == "DSTDEV" || name == "DSTDEVP" {
                var.sqrt()
            } else {
                var
            };
            Value::Number(result)
        }

        // === Engineering / base conversion / bit ops ===
        //
        // Excel's base-conversion family uses a fixed-width signed
        // two's-complement encoding when the input is at the maximum
        // width: BIN at 10 bits, OCT at 30 bits (10 octal digits), HEX
        // at 40 bits (10 hex digits). Inputs shorter than the max are
        // treated as positive. See `parse_base_n_text` and
        // `format_base_n_signed` for the shared core; the per-function
        // arms are thin wrappers that pick base / max-chars and any
        // composition.
        "BIN2DEC" => eval_xxx2dec(args, provider, 2, 10, 1),
                _ => unreachable!(),
    }
}
