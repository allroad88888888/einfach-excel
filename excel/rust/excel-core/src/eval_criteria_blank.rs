//! 条件聚合家族的**候选枚举**：在不物化空格的前提下回答「这个矩形里，哪些位置
//! 可能命中」。
//!
//! 只做这一件事。八个函数各自怎么把候选折成答案在 `eval_criteria_family.rs`。
//! `#[path]` 平铺在 `src/`、仍是 `eval` 的子模块，先例与理由见 `eval_wrap.rs`
//! 的文件头（`eval.rs` 两万多行，新逻辑不该继续往里堆）。
//!
//! # 为什么需要这一层
//!
//! `EvalProvider::for_each_range_cell` 的契约是**只发非空格**（与
//! `tests/sparse_range_blank_cardinality.rs` 同源的那条）。于是「空格算不算命中」
//! 这件事，光靠遍历回调是答不出来的 —— 空格根本没发出来。而 Excel 里**判据是认
//! 空格的**：`""` / `"="` / `"<>x"` / `"<>*"` 都命中空格（`>` `<` `>=` `<=` 与
//! 具体数值不命中）。`A1=1 / A2 空 / A3=3` 上 `COUNTIF(A1:A3,"")` 因此答 0，
//! Excel 与本仓 TS 参考引擎答 1。
//!
//! 反过来「把矩形铺开逐格看」也不行：`COUNTIF(A:A,"")` 是一百万格，
//! `COUNTIFS(A:XFD,"")` 是一百七十亿格。本文件的存在就是为了**两个都不选**。
//!
//! # 三条路，按判据认不认空格分流
//!
//! 1. **有一条判据不认空格** → 拿它当 driver 稀疏流。任何命中位置在这条判据上
//!    必然非空，所以稀疏流一个都不会漏。隐式命中数 0。
//! 2. **判据全认空格，且要的是「值」**（SUMIF/AVERAGEIF/SUMIFS/AVERAGEIFS/
//!    MAXIFS/MINIFS）→ 拿**值区**稀疏流当 driver。值格为空的位置对和 / 平均 /
//!    极值都没有贡献，漏掉它们不影响答案。隐式命中数 0。
//! 3. **判据全认空格，且要的是「个数」**（COUNTIF/COUNTIFS）→ 全空位置一律全中，
//!    数量 = 矩形格数 − 各条件区非空位置的并集大小。**闭式，一格都不访问**。
//!
//! 三条路合起来的上界是「相关区域里的非空格数」，与矩形大小无关。
//!
//! # 口径来源
//!
//! 本仓 TS 参考引擎的 `eval/sparse-criteria.ts` + `eval/sparse-single-criterion.ts`
//! （`matchesBlank` / `implicitCount` / non-blank driver 三件套）。那一套有 Excel
//! 实测背书，Rust 侧向它收敛。语义照抄、结构不照抄 —— Rust 这边的漏斗是
//! `resolve_range_arg` + `fetch_range_cell` + `for_each_ref_value_indexed`，
//! 新逻辑长在它上面，不另起一套遍历。

use std::collections::BTreeSet;

use super::*;

/// 判据认不认「空格」。
///
/// 判定方式就是**拿空格去问判据本身**，不另写一套分类 —— 多一份分类就多一处
/// 会漂移的口径。`matches_criterion` 已经把 Excel 的分档做全了：
/// `""` / `"="`（文本兜底，空串相等）、`"<>x"`（不等于，空格当空串）、
/// `"<>*"`（通配符档，空格不是文本格 → `<>` 侧命中）都返回真；
/// `">0"` / `0` / `"<5"` 这类数值判据返回假。
pub(super) fn criterion_matches_blank(criterion: &Value) -> bool {
    matches_criterion(&Value::Null, criterion)
}

/// 一条「条件区 + 判据」配对，外加一个**只算一次**的「这条判据认不认空格」。
pub(super) struct CriterionPair {
    pub(super) rect: ResolvedRange,
    pub(super) criterion: Value,
    matches_blank: bool,
}

impl CriterionPair {
    pub(super) fn new(rect: ResolvedRange, criterion: Value) -> Self {
        CriterionPair {
            matches_blank: criterion_matches_blank(&criterion),
            rect,
            criterion,
        }
    }
}

/// `collect_criteria_pairs` 的结果 + 每条判据的「认不认空格」。形状校验、
/// 判据实参求值与错误传播都在那边做完了，这里只加一列。
pub(super) fn build_pairs(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Result<Vec<CriterionPair>, ValueError> {
    Ok(collect_criteria_pairs(args, provider)?
        .into_iter()
        .map(|(rect, criterion)| CriterionPair::new(rect, criterion))
        .collect())
}

/// 一个位置是否满足**所有**判据。条件区里的错误格不短路 —— 判定全交给
/// `matches_criterion`（带不带通配符是两套规则，见它的文档），这里不加第二套。
pub(super) fn all_match(
    pairs: &[CriterionPair],
    dr: u32,
    dc: u32,
    provider: &dyn EvalProvider,
) -> bool {
    pairs
        .iter()
        .all(|p| matches_criterion(&fetch_range_cell(&p.rect, dr, dc, provider), &p.criterion))
}

/// 把一个矩形按 `(rows, cols)` 这个**形状**稀疏地流出来，回调拿到区域内的
/// 相对偏移 `(dr, dc)`。
///
/// 形状是外来的而不是 `rect` 自己的：SUMIF / AVERAGEIF 三参的求和区按 Excel
/// 规则只贡献**左上角**，行列数取条件区的（`SUMIF(A1:A3,">1",B1)` 与
/// `SUMIF(A1:A3,">1",B1:B10)` 同值）。所以这里现搭一个「以 `rect` 左上角为原点、
/// 条件区形状」的 `RuntimeRef` 交给 `for_each_ref_value_indexed` —— 走的仍是那条
/// 漏斗，跨表 / 同表 / 物化三条分支只有那一份。
///
/// 物化引用（`INDEX` / 溢出区）自己走数组：`for_each_ref_value_indexed` 对它是
/// **稠密**的（连 `Null` 一起发），而这里要的是「只发非空格」的统一契约。数组
/// 尺寸有 `DYNAMIC_ARRAY_CELL_CAP` 兜底，不存在整轴那种量级。
fn stream_rect(
    rect: &ResolvedRange,
    rows: u32,
    cols: u32,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(u32, u32, Value),
) {
    if let Some(arr) = &rect.materialized {
        let (arr_rows, arr_cols) = arr.shape();
        for dr in 0..rows.min(arr_rows) {
            for dc in 0..cols.min(arr_cols) {
                match arr.get(dr, dc) {
                    None | Some(Value::Null) => {}
                    Some(v) => f(dr, dc, v.clone()),
                }
            }
        }
        return;
    }
    let start = CellAddress::new(rect.start_row, rect.start_col);
    let end = CellAddress::new(
        rect.start_row.saturating_add(rows.saturating_sub(1)),
        rect.start_col.saturating_add(cols.saturating_sub(1)),
    );
    let r = RuntimeRef {
        sheet: rect.sheet.clone(),
        range: CellRange::new(start, end),
        materialized: None,
    };
    for_each_ref_value_indexed(&r, provider, &mut |addr, _pos, v| {
        let Some(addr) = addr else { return };
        let dr = addr.row.saturating_sub(rect.start_row);
        let dc = addr.col.saturating_sub(rect.start_col);
        if dr < rows && dc < cols {
            f(dr, dc, v);
        }
    });
}

/// **值型**函数（SUMIF/AVERAGEIF/SUMIFS/AVERAGEIFS/MAXIFS/MINIFS）的候选枚举。
///
/// 走上面的路 1 或路 2，两条都闭式。没有隐式命中 —— 值格为空的位置对和 / 平均 /
/// 极值都没有贡献，所以「没被枚举到」和「枚举到但贡献 0」等价。
///
/// 回调顺序是**行主序**（provider 的稀疏流按 `(row, col)` 归并，见
/// `Sheet::for_each_sparse_cell_with`），与原来的稠密双重循环一致 —— 浮点求和的
/// 累加次序因此不变。
pub(super) fn for_each_value_candidate(
    pairs: &[CriterionPair],
    value: &ResolvedRange,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(u32, u32),
) {
    let (rows, cols) = (pairs[0].rect.rows, pairs[0].rect.cols);
    match pairs.iter().find(|p| !p.matches_blank) {
        Some(driver) => stream_rect(&driver.rect, rows, cols, provider, &mut |dr, dc, v| {
            if matches_criterion(&v, &driver.criterion) {
                f(dr, dc);
            }
        }),
        None => stream_rect(value, rows, cols, provider, &mut |dr, dc, _| f(dr, dc)),
    }
}

/// **计数型**函数（COUNTIFS）的候选枚举。返回**隐式命中数**：那些在每一个条件区
/// 里都是空格、因而自动满足全部判据的位置，一格都没访问就数出来了。
///
/// 走路 1 或路 3。路 3 里 `矩形格数 − 并集大小` 就是隐式命中数 —— 判据既然全认
/// 空格，全空位置必然全中。
///
/// `saturating_sub` 不是防御性写法：稠密 provider（单元测试用的
/// `AtomEvalProvider`）连空格一起发，此时并集就是整个矩形，差额恰好是 0，
/// 那些位置改由回调逐个判定，答案与稀疏路径相同。
pub(super) fn count_candidates(
    pairs: &[CriterionPair],
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(u32, u32),
) -> u64 {
    let (rows, cols) = (pairs[0].rect.rows, pairs[0].rect.cols);
    let extent = rows as u64 * cols as u64;

    if let Some(driver) = pairs.iter().find(|p| !p.matches_blank) {
        stream_rect(&driver.rect, rows, cols, provider, &mut |dr, dc, v| {
            if matches_criterion(&v, &driver.criterion) {
                f(dr, dc);
            }
        });
        return 0;
    }

    // 单条判据：一个区域不会把同一个位置发两遍，不必去重，也就不必攒集合。
    // `COUNTIF(A:A,"")` / `COUNTIFS(A:A,"")` 走的正是这条 —— 两次减法。
    if pairs.len() == 1 {
        let mut emitted = 0u64;
        stream_rect(&pairs[0].rect, rows, cols, provider, &mut |dr, dc, _| {
            emitted += 1;
            f(dr, dc);
        });
        return extent.saturating_sub(emitted);
    }

    // 多条判据：并集要去重。`BTreeSet` 而不是 `HashSet` —— 顺序仍是行主序，
    // 与单条那条路和原来的稠密循环一致。集合大小的上界是**相关区域的非空格数**，
    // 与矩形大小无关，所以整轴照样闭式。
    let mut seen: BTreeSet<(u32, u32)> = BTreeSet::new();
    for pair in pairs {
        stream_rect(&pair.rect, rows, cols, provider, &mut |dr, dc, _| {
            seen.insert((dr, dc));
        });
    }
    for &(dr, dc) in &seen {
        f(dr, dc);
    }
    extent.saturating_sub(seen.len() as u64)
}

/// 值型家族的公共骨架：枚举候选 → 判全部条件 → 取值格 → 喂给 `sink`。
///
/// 值区的错误格**要传播**（与 `SUM` 同口径），条件区的不传播。流式回调不能提前
/// 返回，所以记下来交给调用方。命中位置的取值仍走 `fetch_range_cell`，跨表 /
/// 同表 / 物化的分派只有那一份。
pub(super) fn for_each_matched_number(
    pairs: &[CriterionPair],
    value: &ResolvedRange,
    provider: &dyn EvalProvider,
    coerce: fn(&Value) -> Option<f64>,
    sink: &mut dyn FnMut(f64),
) -> Option<ValueError> {
    let mut err: Option<ValueError> = None;
    for_each_value_candidate(pairs, value, provider, &mut |dr, dc| {
        if err.is_some() || !all_match(pairs, dr, dc, provider) {
            return;
        }
        let target = fetch_range_cell(value, dr, dc, provider);
        if let Value::Error(e) = target {
            err = Some(e);
            return;
        }
        if let Some(n) = coerce(&target) {
            sink(n);
        }
    });
    err
}

/// SUMIFS / AVERAGEIFS / MAXIFS / MINIFS 的取数口径：**只认真正的数字**。
/// 对照 `SUMIF` 用的 `coerce_to_number`（还认布尔与空格）—— 这条家族内部的
/// 分歧是存量，本次不动。
pub(super) fn number_only(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => Some(*n),
        _ => None,
    }
}
