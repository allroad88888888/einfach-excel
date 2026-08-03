//! `WRAPROWS` / `WRAPCOLS` —— 把一维向量折成二维数组的那一对。
//!
//! 只做这一件事：一个向量 + 一个「每行（或每列）最多放几个」= 一个矩形。
//! 其余 Excel 365 动态数组批次（`TOCOL` / `TAKE` / `EXPAND` / `HSTACK` …）
//! 仍住在 `eval.rs` 的分发表里；这两个新来的单开一个文件，是因为 `eval.rs`
//! 已经三万九千行、严重超过本仓的 500 行上限，往里塞是让存量问题更坏。
//! `#[path]` + `mod eval_wrap;`（在 `eval.rs` 顶部）与 `eval_regex.rs` 同一
//! 个先例：文件平铺在 `src/`，模块仍是 `eval` 的子模块，于是能直接用
//! `super::` 下那批私有 helper，不必为此把它们放宽可见性。
//!
//! # 方向（这一对极容易搞反，所以把依据抄在这里）
//!
//! 微软 support「WRAPROWS function」：`wrap_count` 是 **"The maximum number
//! of values for each row"**，元素 **"by row"** 铺进二维数组。
//! 「WRAPCOLS function」：`wrap_count` 是 **"The maximum number of values for
//! each column"**，**"by column"** 铺。
//!
//! 于是同一个 6 元素向量 `{1;2;3;4;5;6}`、同一个 `wrap_count = 2`：
//!
//! ```text
//! =WRAPROWS(v, 2)      =WRAPCOLS(v, 2)
//!   1 2                  1 3 5
//!   3 4                  2 4 6
//!   5 6
//! ```
//!
//! 即 WRAPROWS 是 3 行 × 2 列（每**行** 2 个），WRAPCOLS 是 2 行 × 3 列
//! （每**列** 2 个）。微软文档自己的例子对得上：`=WRAPROWS(A2:G2,3)`（7 个
//! 元素）给出 3 列宽、第三行是 `G, #N/A, #N/A`。
//!
//! # 其余口径与依据
//!
//! - `vector` 不是一维 → `#VALUE!`（"#VALUE when the input isn't
//!   one-dimensional"）。1×1 的标量算一维。
//! - `wrap_count < 1` → `#NUM!`（"#NUM when wrap_count is less than 1"）。
//!   非整数文档没写，与 TS 参考引擎一致按截断处理。
//! - `pad_with` 缺省是 `#N/A`（"The value with which to pad. The default is
//!   #N/A."）。它是**值**不是错误传播源 —— 缺省值本身就是个错误值，所以
//!   第三个实参求值出错时当 pad 用，不短路。
//! - `wrap_count >= 元素个数` → 原样返回单行 / 单列，**不**补齐到
//!   `wrap_count` 宽（"the vector is simply returned in a single row"）。
//! - 结果超上限 → 走 `super::checked_array_len` 那一个闸门（`#VALUE!`），
//!   与 `SEQUENCE` / `arg_to_2d` 同口径。「超网格 vs 超格数上限」两个码的
//!   分歧是本引擎的已知未决项，说明在 `eval.rs` 的 `DYNAMIC_ARRAY_CELL_CAP`
//!   文档注释里 —— 这里不新造第二套。

use std::sync::Arc;

use einfach_core::{ArrayData, Value, ValueError};

use crate::formula::Expr;

use super::{arg_to_2d, checked_array_len, coerce_to_number, eval_expr_with_provider, EvalProvider};

/// `WRAPROWS(vector, wrap_count, [pad_with])` —— 每**行**最多 `wrap_count` 个。
pub(super) fn fn_wraprows(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    wrap(args, provider, Axis::Rows)
}

/// `WRAPCOLS(vector, wrap_count, [pad_with])` —— 每**列**最多 `wrap_count` 个。
pub(super) fn fn_wrapcols(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    wrap(args, provider, Axis::Cols)
}

/// 折叠轴：`wrap_count` 数的是哪一维上的元素个数。
#[derive(Clone, Copy, PartialEq, Eq)]
enum Axis {
    /// WRAPROWS —— 每行 `wrap_count` 个，逐行铺。
    Rows,
    /// WRAPCOLS —— 每列 `wrap_count` 个，逐列铺。
    Cols,
}

fn wrap(args: &[Expr], provider: &dyn EvalProvider, axis: Axis) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let values = match read_vector(&args[0], provider) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    let requested = match read_wrap_count(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return Value::Error(e),
    };

    // `read_vector` 已经挡掉空向量，所以 len >= 1。
    let len = values.len() as u64;
    // `wrap_count` 大于等于元素个数时 Excel 原样返回单行 / 单列，所以在这里
    // 夹到 `len`：既落实了那条语义，也让下面的 f64 → u64 不必再防溢出
    // （夹完一定落在 1..=len）。
    let wrap_count = if requested >= len as f64 { len } else { requested as u64 };
    // 折叠轴上的长度 = wrap_count；另一轴 = 向上取整的份数。
    let along = wrap_count;
    let across = len.div_ceil(wrap_count);
    let (rows, cols) = match axis {
        Axis::Rows => (across, along),
        Axis::Cols => (along, across),
    };

    let total = match checked_array_len(rows, cols) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let (rows, cols) = match (u32::try_from(rows), u32::try_from(cols)) {
        (Ok(r), Ok(c)) => (r, c),
        _ => return Value::Error(ValueError::InvalidValue),
    };

    let pad = match read_pad(args, provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };

    let mut out: Vec<Value> = Vec::with_capacity(total);
    for r in 0..u64::from(rows) {
        for c in 0..u64::from(cols) {
            // 逐行铺：第 r 行第 c 个 = 第 `r * wrap_count + c` 个元素。
            // 逐列铺：第 c 列第 r 个 = 第 `c * wrap_count + r` 个元素。
            let idx = match axis {
                Axis::Rows => r * wrap_count + c,
                Axis::Cols => c * wrap_count + r,
            };
            match values.get(idx as usize) {
                Some(v) => out.push(v.clone()),
                None => out.push(pad.clone()),
            }
        }
    }
    Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
}

/// 把第一个实参读成一维向量（读序即行序 / 列序）。
///
/// `arg_to_2d` 给的是行主序缓冲：1×n 时它就是从左到右，n×1 时就是从上到下，
/// 两种都正好是 Excel 说的「向量的元素顺序」，所以不需要再转置。
fn read_vector(arg: &Expr, provider: &dyn EvalProvider) -> Result<Vec<Value>, ValueError> {
    let (rows, cols, data) = arg_to_2d(arg, provider)?;
    if rows == 0 || cols == 0 {
        return Err(ValueError::InvalidValue);
    }
    if rows != 1 && cols != 1 {
        // "#VALUE when the input isn't one-dimensional".
        return Err(ValueError::InvalidValue);
    }
    Ok(data)
}

/// 读 `wrap_count`，返回已截断、已保证 `>= 1` 的份额。
///
/// 返回 f64 而不是 u64：夹到向量长度这一步要等调用方拿到长度才能做，在这里
/// 强转反而要先防一次溢出。
fn read_wrap_count(arg: &Expr, provider: &dyn EvalProvider) -> Result<f64, ValueError> {
    let v = eval_expr_with_provider(arg, provider);
    if let Value::Error(e) = v {
        return Err(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) => n,
        // 转不成数字是类型错，渲染边界收成 `#VALUE!`，与 TS 参考引擎一致。
        None => return Err(ValueError::WrongType),
    };
    if !n.is_finite() {
        return Err(ValueError::Overflow);
    }
    let n = n.trunc();
    if n < 1.0 {
        // "#NUM when wrap_count is less than 1".
        return Err(ValueError::Overflow);
    }
    Ok(n)
}

/// 读 `pad_with`。缺省 `#N/A`；求值出错**不**传播（错误值是合法的 pad）。
fn read_pad(args: &[Expr], provider: &dyn EvalProvider) -> Result<Value, ValueError> {
    if args.len() < 3 {
        return Ok(Value::Error(ValueError::NotAvailable));
    }
    let v = eval_expr_with_provider(&args[2], provider);
    if matches!(v, Value::Array(_)) {
        // pad 必须是标量：数组会被逐格塞进结果，造出嵌套数组，下游 spill /
        // 渲染都接不住。TS 参考引擎同样在这里给 `#VALUE!`。
        return Err(ValueError::InvalidValue);
    }
    Ok(v)
}
