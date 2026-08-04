//! 条件聚合家族的八个求值体：COUNTIF / SUMIF / AVERAGEIF /
//! COUNTIFS / SUMIFS / AVERAGEIFS / MAXIFS / MINIFS。
//!
//! 只做这一件事：把 `eval_criteria_blank.rs` 枚举出来的候选位置折成答案。
//! 「候选怎么来的、空格为什么不用物化」全在那边，这里不重复。
//!
//! # 家族内共同的分档（改任何一个都要对齐另外七个）
//!
//! - **判据实参本身**求值成错误 → 原样传播（普通实参错误规则）。
//! - **条件区里的错误格** → 不短路，就是一个满足或不满足判据的普通格子，
//!   由 `matches_criterion` 按「判据带不带通配符」分档判定。
//! - **值区（求和 / 平均 / 极值区）里的错误格** → 命中位置上要传播，与 `SUM`
//!   同口径；没命中的位置根本不会被读，泄不出来。
//! - **空格** → 认不认由判据决定（`criterion_matches_blank`）。认，则空格位置
//!   算命中：对 COUNTIF/COUNTIFS 贡献个数，对值型函数贡献「值区那一格的值」
//!   （值区那一格自己是不是空格，是另一回事）。
//!
//! # 形状规则
//!
//! - `COUNTIFS` / `SUMIFS` / `AVERAGEIFS` / `MAXIFS` / `MINIFS`：所有条件区与
//!   值区共享同一个 `(rows, cols)`，不一致 → `#VALUE!`。
//! - `SUMIF` / `AVERAGEIF` 三参：`SUMIF` 按 Excel 的「左上角 + 条件区形状」
//!   重定尺寸（求和区自己的行列数不参与）；`AVERAGEIF` 沿用本仓既有的严格
//!   同形校验，不一致 → `#VALUE!`。这条家族内部的不一致是存量，本次不动。

use super::eval_criteria_blank::{
    all_match, build_pairs, count_candidates, criterion_matches_blank, for_each_matched_number,
    number_only, CriterionPair,
};
use super::*;

/// 判据实参求值 + 错误传播。八个函数的第一步都是它。
fn eval_criterion(arg: &Expr, provider: &dyn EvalProvider) -> Result<Value, ValueError> {
    match eval_expr_with_provider(arg, provider) {
        Value::Error(e) => Err(e),
        v => Ok(v),
    }
}

/// 值型多条件函数（SUMIFS / AVERAGEIFS / MAXIFS / MINIFS）共用的开头：
/// 值区 = `args[0]`，判据对 = `args[1..]`，形状必须全等。
fn value_family_setup(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Result<(ResolvedRange, Vec<CriterionPair>), ValueError> {
    if args.len() < 3 || args.len() % 2 == 0 {
        return Err(ValueError::WrongArgCount);
    }
    let value = resolve_range_arg(&args[0], provider).ok_or(ValueError::InvalidValue)?;
    let pairs = build_pairs(&args[1..], provider)?;
    for pair in &pairs {
        if pair.rect.rows != value.rows || pair.rect.cols != value.cols {
            return Err(ValueError::InvalidValue);
        }
    }
    Ok((value, pairs))
}

// ───────────────────────────── 单条件 ─────────────────────────────

/// `COUNTIF(range, criterion)`。
///
/// 空格那一档是**闭式**：`for_each_arg_value_indexed` 的返回值是实参的矩形格数，
/// 减掉回调被调次数就是稀疏遍历跳过的空格数 —— 判据认空格时整块加进来，一个都
/// 不用访问。`COUNTIF(A:A,"")` 因此是两次减法而不是一百万次迭代，口径与
/// `COUNTBLANK(A:A)` 对齐（同一个矩形基数、同一套「算不算空」）。
///
/// 非区域实参（标量 / 数组字面量）没有矩形也就没有洞，返回 `None`，补零。
pub(super) fn fn_countif(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let criterion = match eval_criterion(&args[1], provider) {
        Ok(c) => c,
        Err(e) => return Value::Error(e),
    };
    let mut emitted = 0u64;
    let mut count = 0u64;
    let extent = for_each_arg_value_indexed(&args[0], provider, &mut |_addr, _pos, v| {
        emitted += 1;
        if matches_criterion(&v, &criterion) {
            count += 1;
        }
    });
    if criterion_matches_blank(&criterion) {
        count += extent.unwrap_or(emitted).saturating_sub(emitted);
    }
    Value::Number(count as f64)
}

/// `SUMIF(range, criterion[, sum_range])`。
///
/// 二参形态**不需要补空格**：值就是条件区自己，空格加进去也是加 0。三参形态才
/// 要 —— 条件区的空格位置上，求和区那一格可能是个实打实的数
/// （`SUMIF(A1:A3,"",B1:B3)` 在 A2 空、B2=20 时答 20）。
pub(super) fn fn_sumif(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 && args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let criterion = match eval_criterion(&args[1], provider) {
        Ok(c) => c,
        Err(e) => return Value::Error(e),
    };
    if args.len() == 3 {
        // 两个区域实参走同一条入口（`resolve_range_arg`），跨表 / 同表 / 单格 /
        // 动态区域从解析那一步起就不分叉。任一侧不是引用（数组字面量 / 标量 /
        // 求值出错的子表达式）就没有「相对位置」可言 —— 退回二参口径。
        if let (Some(crit), Some(sum)) = (
            resolve_range_arg(&args[0], provider),
            resolve_range_arg(&args[2], provider),
        ) {
            let pairs = vec![CriterionPair::new(crit, criterion)];
            let mut total = 0.0_f64;
            if let Some(e) =
                for_each_matched_number(&pairs, &sum, provider, coerce_to_number, &mut |n| {
                    total += n
                })
            {
                return Value::Error(e);
            }
            return Value::Number(total);
        }
    }
    let mut total = 0.0_f64;
    for_each_arg_value(&args[0], provider, &mut |_addr, v| {
        if matches_criterion(&v, &criterion) {
            if let Some(n) = coerce_to_number(&v) {
                total += n;
            }
        }
    });
    Value::Number(total)
}

/// `AVERAGEIF(range, criterion[, average_range])`。
///
/// 平均区里只有**真正的数字**进分母：空格、文本、布尔都不计数，所以
/// `AVERAGEIF(A1:A3,"")` 在「唯一命中的是空格」时是 `#DIV/0!` 而不是 0
/// （微软文档：average_range 里的空格被忽略；没有格子满足条件则 `#DIV/0!`）。
pub(super) fn fn_averageif(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 && args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let Some(crit) = resolve_range_arg(&args[0], provider) else {
        return Value::Error(ValueError::InvalidValue);
    };
    let value = if args.len() == 3 {
        match resolve_range_arg(&args[2], provider) {
            Some(r) => r,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        crit.clone()
    };
    if crit.rows != value.rows || crit.cols != value.cols {
        return Value::Error(ValueError::InvalidValue);
    }
    let criterion = match eval_criterion(&args[1], provider) {
        Ok(c) => c,
        Err(e) => return Value::Error(e),
    };
    let pairs = vec![CriterionPair::new(crit, criterion)];
    average_over(&pairs, &value, provider)
}

// ───────────────────────────── 多条件 ─────────────────────────────

/// `COUNTIFS(range1, criterion1, ...)`。
///
/// 判据全认空格时，「全空位置」由 `count_candidates` 闭式减出来 ——
/// `COUNTIFS(A:A,"")` 与 `COUNTBLANK(A:A)` 同为 1048574，同一套矩形基数。
///
/// 这里曾经挂着一条 `has_value` 守卫（「一行里所有条件区都是空格就不算命中」），
/// 它把**认空格的判据**整类判死：`COUNTIFS(A1:A3,"")` 答 0、
/// `COUNTIFS(A1:A3,"<>1")` 少数一格。那条守卫是当年为了挡住「整列引用把一百万
/// 个空格全数进来」加的止血带，现在整轴基数本身就是正确答案，止血带去掉。
pub(super) fn fn_countifs(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() % 2 != 0 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match build_pairs(args, provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    let mut count = 0u64;
    let implicit = count_candidates(&pairs, provider, &mut |dr, dc| {
        if all_match(&pairs, dr, dc, provider) {
            count += 1;
        }
    });
    Value::Number((count + implicit) as f64)
}

/// `SUMIFS(sum_range, range1, criterion1, ...)`。
pub(super) fn fn_sumifs(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let (value, pairs) = match value_family_setup(args, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let mut total = 0.0_f64;
    if let Some(e) = for_each_matched_number(&pairs, &value, provider, number_only, &mut |n| {
        total += n
    }) {
        return Value::Error(e);
    }
    Value::Number(total)
}

/// `AVERAGEIFS(average_range, range1, criterion1, ...)`。
pub(super) fn fn_averageifs(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    let (value, pairs) = match value_family_setup(args, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    average_over(&pairs, &value, provider)
}

/// `MAXIFS(max_range, range1, criterion1, ...)`。一格都没命中时 Excel 答 0。
pub(super) fn fn_maxifs(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    extremum_over(args, provider, f64::max)
}

/// `MINIFS(min_range, range1, criterion1, ...)`。一格都没命中时 Excel 答 0。
pub(super) fn fn_minifs(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    extremum_over(args, provider, f64::min)
}

// ───────────────────────────── 折叠器 ─────────────────────────────

fn average_over(
    pairs: &[CriterionPair],
    value: &ResolvedRange,
    provider: &dyn EvalProvider,
) -> Value {
    let (mut sum, mut count) = (0.0_f64, 0u64);
    if let Some(e) = for_each_matched_number(pairs, value, provider, number_only, &mut |n| {
        sum += n;
        count += 1;
    }) {
        return Value::Error(e);
    }
    if count == 0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number(sum / count as f64)
}

fn extremum_over(
    args: &[Expr],
    provider: &dyn EvalProvider,
    pick: fn(f64, f64) -> f64,
) -> Value {
    let (value, pairs) = match value_family_setup(args, provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let mut best: Option<f64> = None;
    if let Some(e) = for_each_matched_number(&pairs, &value, provider, number_only, &mut |n| {
        best = Some(match best {
            Some(b) => pick(b, n),
            None => n,
        });
    }) {
        return Value::Error(e);
    }
    Value::Number(best.unwrap_or(0.0))
}
