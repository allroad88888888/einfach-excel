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
//! - `SUMIF` / `AVERAGEIF` 三参：值区按 Excel 的「左上角 + 条件区形状」重定
//!   尺寸，值区自己的行列数不参与 —— 见 `value_rect_fits` 的文档。两个函数
//!   同一条规则；`AVERAGEIF` 曾单独挂着一条严格同形校验（`#VALUE!`），那是
//!   存量分歧，已去掉。

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

/// 三参 `SUMIF` / `AVERAGEIF` 的值区实际矩形放不放得下。
///
/// Excel 的值区**只取左上角**，行列数由条件区决定（"…using the upper leftmost
/// cell in the sum_range argument as the beginning cell, and then including
/// cells that correspond in size and shape to the range argument" —— Microsoft,
/// SUMIF）。铺开那一步本来就由 `for_each_value_candidate` + `fetch_range_cell`
/// 做掉了，本函数只回答**越不越界**：`B1048575` 配 3 行条件区要读到第 1048577
/// 行，网格外，Excel 给 `#REF!`；没有这道闸它们会静悄悄读成空格，
/// `SUMIF(A1:A3,">1",B1048575)` 答 0。TS 参考引擎同口径的实现是
/// `excel/excel-core-ts/src/eval/criteria-value-rect.ts::criteriaValueRect`。
///
/// 物化引用（`INDEX` / 溢出区的快照）没有网格坐标可越界，一律放行。
fn value_rect_fits(criteria: &ResolvedRange, value: &ResolvedRange) -> bool {
    if value.materialized.is_some() {
        return true;
    }
    value.start_row as u64 + criteria.rows as u64 <= EXCEL_MAX_ROWS as u64
        && value.start_col as u64 + criteria.cols as u64 <= EXCEL_MAX_COLS as u64
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
    let value = resolve_range_arg(&args[0], provider)?.ok_or(ValueError::InvalidValue)?;
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
/// 空格那一档是**闭式**：实参矩形格数减去稀疏回调次数就是跳过的空格数；判据
/// 认空格时整块加进来而不用访问。`COUNTIF(A:A,"")` 因此与 `COUNTBLANK(A:A)`
/// 同口径、只需两次减法。
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
    if let Err(e) = resolve_range_arg(&args[0], provider) {
        return Value::Error(e);
    }
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
/// 二参形态不用补空格；三参形态需要，因为条件区空格在求和区可对应实数
/// （`SUMIF(A1:A3,"",B1:B3)` 在 A2 空、B2=20 时答 20）。
pub(super) fn fn_sumif(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 && args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let criterion = match eval_criterion(&args[1], provider) {
        Ok(c) => c,
        Err(e) => return Value::Error(e),
    };
    let crit_range = match resolve_range_arg(&args[0], provider) {
        Ok(range) => range,
        Err(e) => return Value::Error(e),
    };
    if args.len() == 3 {
        // 两个区域实参走同一条入口（`resolve_range_arg`），跨表 / 同表 / 单格 /
        // 动态区域从解析那一步起就不分叉。任一侧不是引用（数组字面量 / 标量 /
        // 求值出错的子表达式）就没有「相对位置」可言 —— 退回二参口径。
        let sum_range = match resolve_range_arg(&args[2], provider) {
            Ok(range) => range,
            Err(e) => return Value::Error(e),
        };
        if let (Some(crit), Some(sum)) = (crit_range, sum_range) {
            if !value_rect_fits(&crit, &sum) {
                return Value::Error(ValueError::InvalidRef);
            }
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
/// 只有数字进分母，命中空格但没有数字时答 `#DIV/0!`。average_range 与
/// `SUMIF` 共用 `value_rect_fits`，都按条件区左上角和形状展开。
pub(super) fn fn_averageif(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 && args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let crit = match resolve_range_arg(&args[0], provider) {
        Ok(Some(range)) => range,
        Ok(None) => return Value::Error(ValueError::InvalidValue),
        Err(e) => return Value::Error(e),
    };
    let value = if args.len() == 3 {
        match resolve_range_arg(&args[2], provider) {
            Ok(Some(range)) => range,
            Ok(None) => return Value::Error(ValueError::InvalidValue),
            Err(e) => return Value::Error(e),
        }
    } else {
        crit.clone()
    };
    if !value_rect_fits(&crit, &value) {
        return Value::Error(ValueError::InvalidRef);
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
