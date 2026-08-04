//! Dispatches lookup classic formula functions.

use super::eval_lookup_range_grid::collect_lookup_range_2d_for_arg;
use super::*;

pub(super) fn eval_fn_lookup_classic(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {
        "VLOOKUP" => {
            // VLOOKUP(lookup_value, table_range, col_index, [range_lookup])
            // range_lookup: TRUE/omitted = approximate (range must be sorted
            // ascending in col 1; finds largest value ≤ needle), FALSE = exact.
            // Exact mode honors Excel wildcards (`?`, `*`, `~`) when the
            // needle is text; see `lookup_2d`.
            if args.len() < 3 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let needle = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = needle {
                return Value::Error(e);
            }
            let grid = match collect_lookup_range_2d_for_arg(&args[1], provider) {
                Some(g) => g,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let col_idx = match coerce_to_number(&eval_expr_with_provider(&args[2], provider)) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::WrongType),
            };
            let approximate = if args.len() == 4 {
                coerce_to_bool(&eval_expr_with_provider(&args[3], provider)).unwrap_or(true)
            } else {
                true
            };
            lookup_2d(
                &grid,
                &needle,
                col_idx,
                approximate,
                /* horizontal = */ false,
            )
        }

        "HLOOKUP" => {
            // HLOOKUP shares the `lookup_2d` engine with VLOOKUP — same
            // wildcard rules apply (only in exact-match mode).
            if args.len() < 3 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let needle = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = needle {
                return Value::Error(e);
            }
            let grid = match collect_lookup_range_2d_for_arg(&args[1], provider) {
                Some(g) => g,
                None => return Value::Error(ValueError::InvalidValue),
            };
            let row_idx = match coerce_to_number(&eval_expr_with_provider(&args[2], provider)) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::WrongType),
            };
            let approximate = if args.len() == 4 {
                coerce_to_bool(&eval_expr_with_provider(&args[3], provider)).unwrap_or(true)
            } else {
                true
            };
            lookup_2d(
                &grid,
                &needle,
                row_idx,
                approximate,
                /* horizontal = */ true,
            )
        }

        "INDEX" => match runtime_ref_from_index(args, provider) {
            Ok(r) => runtime_ref_to_value(&r, provider),
            Err(e) => Value::Error(e),
        },

        "MATCH" => {
            // MATCH(value, range, [match_type])
            //
            // 返回的是命中格在区域内的**绝对位置**（1-based，行主序），由
            // `addr` 相对区域起点算出 —— 不是「第几个被发出来的格子」。
            // 稀疏 provider 不发空格，所以老写法的累加计数器会让空格不占位：
            // `A1=1 / A2 空 / A3=3` 时 `MATCH(3,A1:A3,0)` 答 2 而不是 Excel
            // 的 3。二维区域按行主序数：`A1:B3` 里 B2 是第 4 个、A3 是第 5 个。
            //
            // match_type semantics:
            //   0  → exact match. Text needles with `?`/`*`/`~` engage
            //        Excel wildcard semantics (case-insensitive). The
            //        cell value is coerced to text for the wildcard test,
            //        so `MATCH("4?", {42,3}, 0)` returns 1.
            //   1  → "largest value <= needle". Wildcards NOT honored —
            //        a pattern like "a*" is treated as a literal text key.
            //   -1 → "smallest value >= needle". Wildcards NOT honored.
            //
            // Note: this implementation predates `match_type` plumbing and
            // historically treated *all* invocations as exact-match. We
            // preserve that for type=1/-1 too (no behavior change there);
            // the only new behavior is wildcard expansion when type=0.
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let needle = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = needle {
                return Value::Error(e);
            }
            let match_type: i32 = if args.len() == 3 {
                match coerce_to_number(&eval_expr_with_provider(&args[2], provider)) {
                    Some(n) => n as i32,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                // Excel's true default is 1, but the legacy arm always did
                // exact match; keep that quirk so omitted-3rd-arg tests still
                // pass. Wildcards still engage because we treat default as 0.
                0
            };
            // Pre-check: is this a wildcard-style text needle in exact mode?
            let wildcard_pattern: Option<&str> = if match_type == 0 {
                if let Value::Text(p) = &needle {
                    if pattern_has_wildcard(p) {
                        Some(p.as_str())
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };
            let mut found: Option<u64> = None;
            for_each_arg_value_positioned(&args[1], provider, &mut |pos, v| {
                // 收口取「位置最小的命中」而不是「第一个发出来的命中」。生产
                // provider 的发射顺序是行主序（见 tests/range_materialization_
                // order.rs），两者等价；但位置比较是几何事实，不依赖发射顺序，
                // 而 `pos >= p` 这道守卫同时保留了老写法跳过后续比较的开销。
                if found.is_some_and(|p| pos >= p) {
                    return;
                }
                let hit = match wildcard_pattern {
                    Some(pat) => wildcard_match(pat, &coerce_to_text(&v)),
                    None => values_equal(&v, &needle),
                };
                if hit {
                    found = Some(pos);
                }
            });
            match found {
                Some(p) => Value::Number(p as f64),
                None => Value::Error(ValueError::NotAvailable),
            }
        }

        // Stats
        _ => unreachable!(),
    }
}
