use super::*;

/// Stream a range through `provider.for_each_range_cell`. Used by the
/// stateful aggregates (MEDIAN / MODE / VLOOKUP / INDEX / ...) so they
/// can build their algorithm-required Vec without going through the
/// "collect every cell in the rectangle" path that materialized Nulls
/// for full-column refs. Real-streaming aggregates (SUM / COUNT / ...)
/// drive `for_each_range_cell` directly.
pub(super) fn stream_range(
    start: &CellAddress,
    end: &CellAddress,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(CellAddress, Value),
) {
    let range = CellRange::new(*start, *end);
    provider.for_each_range_cell(range, f);
}

/// Excel maximum dimensions. Full-column (`A:A`) and full-row (`1:1`)
/// ranges use `u32::MAX` as a sentinel on the unbounded axis. Allocating
/// a grid of that size would overflow in debug builds and attempt a
/// multi-billion-cell allocation in release, so dense materialization paths
/// reject these sentinels before allocation.
pub(super) const EXCEL_MAX_ROWS: u32 = 1_048_576;
pub(super) const EXCEL_MAX_COLS: u32 = 16_384;

/// 一个动态数组结果最多能有多少个单元格。SEQUENCE / MAKEARRAY / MAP /
/// MMULT 等所有数组构造器共用这一个闸门，超限一律 `#VALUE!`（而不是去尝试
/// 那次分配）。
///
/// `pub` 是给 WASM 桥用的：宿主 JS 自定义公式的**返回值**也能是二维数组
/// （`einfach-wasm` 的 `js_array_to_value`），它必须复用这同一个上限，
/// 而不是另立一个拍脑袋的常数 —— 否则 `=MYFN()` 能造出内建函数造不出的
/// 尺寸，后面的 spill 路径要为两套上限各写一遍防御。
///
/// # 已知分歧（未决，owner 待定 —— 别顺手「统一」）
///
/// 本闸门只数**格子总数**，不看行列各自是否越过网格。TS 参考引擎有**两道**
/// 闸门且给不同的码。同一批公式今天的答案：
///
/// | 公式 | 本引擎 | TS 引擎 | Excel |
/// |---|---|---|---|
/// | `=SEQUENCE(1048577)` | `#VALUE!` | `#NUM!` | `#NUM!` |
/// | `=SEQUENCE(1,16385)` | `#SPILL!`（数组建出来了，放不下） | `#NUM!` | `#NUM!` |
/// | `=SEQUENCE(2000,2000)` | `#VALUE!` | `#VALUE!` | **不报错**，正常溢出 |
///
/// Excel 那一列的依据是 `Excel.NumErrorCellValueSubType` 这个枚举 —— 它只有
/// 两个成员，其中 `arrayTooLarge` 的原文是 "An error caused by a cell's
/// formula having an array parameter with too many rows or columns. The
/// maximum number of rows and columns in an array parameter is 1048576.
/// Displays as error type #NUM! in Excel."；而 `ValueErrorCellValueSubType`
/// （近百个成员）里**没有任何一条**与数组尺寸有关。所以「越过网格」在 Excel
/// 里是 `#NUM!`，这一半是查实的。
///
/// **另一半查不实**：`DYNAMIC_ARRAY_CELL_CAP` 这条「格数上限」在 Excel 里
/// 根本不是一个概念 —— 2000×2000 = 4e6 格完全塞得进 1048576×16384 的网格，
/// Excel 就是把它溢出去（机器扛不住时弹的是资源耗尽对话框，不是单元格错误）。
/// 它是本引擎自己的内存闸门。因此「两种超限各返回什么」这个问法只有一半有
/// 答案，硬统一成一个码是在替 Excel 编另一半。
pub const DYNAMIC_ARRAY_CELL_CAP: u64 = EXCEL_MAX_ROWS as u64;

pub(super) fn checked_array_len(rows: u64, cols: u64) -> Result<usize, ValueError> {
    let total = rows.checked_mul(cols).ok_or(ValueError::InvalidValue)?;
    if total > DYNAMIC_ARRAY_CELL_CAP {
        return Err(ValueError::InvalidValue);
    }
    usize::try_from(total).map_err(|_| ValueError::InvalidValue)
}

/// Shared inner loop for VLOOKUP / HLOOKUP. `index` is 1-based; for
/// horizontal=false it picks the column to return from a matched row,
/// for horizontal=true it picks the row to return from a matched column.
///
/// In approximate mode (range_lookup=TRUE) the lookup column/row must
/// be ascending; we find the largest value <= needle. Numeric needles
/// use numeric ordering; otherwise text ordering.
pub(super) fn lookup_2d(
    grid: &[Vec<Value>],
    needle: &Value,
    index: usize,
    approximate: bool,
    horizontal: bool,
) -> Value {
    if grid.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }

    // Build the key sequence we search through.
    let keys: Vec<Value> = if horizontal {
        grid[0].clone()
    } else {
        grid.iter()
            .map(|r| r.first().cloned().unwrap_or(Value::Null))
            .collect()
    };

    // Find match position.
    let pos: Option<usize> = if approximate {
        // Linear scan picking largest key <= needle. (binary search is an
        // optimization; correctness is identical.)
        //
        // Excel parity: wildcards are NOT honored in approximate mode. A
        // pattern like "a*" is treated as a literal text key and ordered
        // by `compare_lookup` (string compare). This branch intentionally
        // does not call `wildcard_match`.
        let mut best: Option<usize> = None;
        for (i, k) in keys.iter().enumerate() {
            if compare_lookup(k, needle).is_le() {
                best = Some(i);
            } else {
                break; // input is supposed to be sorted; first overshoot ends scan
            }
        }
        best
    } else if let Value::Text(pattern) = needle {
        if pattern_has_wildcard(pattern) {
            // Excel wildcard match for exact-mode text patterns (`?`, `*`,
            // `~` escape). Non-text cells are coerced to text first so a
            // pattern like "4?" matches a numeric 42.
            keys.iter()
                .position(|k| wildcard_match(pattern, &coerce_to_text(k)))
        } else {
            keys.iter().position(|k| values_equal(k, needle))
        }
    } else {
        keys.iter().position(|k| values_equal(k, needle))
    };

    let p = match pos {
        Some(p) => p,
        None => return Value::Error(ValueError::NotAvailable),
    };

    // Return the cell at the requested row/column from the matched line.
    let cell = if horizontal {
        grid.get(index - 1).and_then(|r| r.get(p))
    } else {
        grid.get(p).and_then(|r| r.get(index - 1))
    };
    cell.cloned()
        .unwrap_or(Value::Error(ValueError::InvalidRef))
}

/// Materialize a function argument as a row-major 2D buffer plus shape.
/// Accepts:
///   - `Expr::Range` / `Expr::SheetRange` — collected via the provider.
///   - `OFFSET(...)` — evaluated to a runtime range, then collected.
///   - Anything else — evaluated to a scalar `Value`; a `Value::Array`
///     result returns its shape and data directly, everything else
///     becomes a 1×1 buffer.
///
/// Returns `Err(InvalidValue)` only for ranges whose nominal rectangle
/// exceeds Excel max bounds (full-column / full-row sentinels). Range
/// extraction failures from the provider yield empty grids rather than
/// errors, matching the rest of eval.rs's range-handling.
pub(super) fn arg_to_2d(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<(u32, u32, Vec<Value>), ValueError> {
    // Range-shaped argument (literal range or OFFSET).
    if let Some(grid) = collect_range_2d_for_arg(arg, provider) {
        if grid.is_empty() {
            // Either an over-bound sentinel range or a 0-row collection.
            // Treat as a 0×0 buffer; callers reject empty arrays as
            // InvalidValue at their own discretion.
            return Ok((0, 0, Vec::new()));
        }
        let rows = grid.len() as u32;
        let cols = grid[0].len() as u32;
        let cap = checked_array_len(rows as u64, cols as u64)?;
        let mut data: Vec<Value> = Vec::with_capacity(cap);
        for row in grid {
            data.extend(row);
        }
        return Ok((rows, cols, data));
    }
    // Non-range argument: evaluate to a value. Array → expand. Scalar → 1×1.
    let v = eval_expr_with_provider(arg, provider);
    match v {
        Value::Array(arr) => {
            let (rows, cols) = arr.shape();
            checked_array_len(rows as u64, cols as u64)?;
            let data = arr.data.clone();
            Ok((rows, cols, data))
        }
        Value::Error(e) => Err(e),
        other => Ok((1, 1, vec![other])),
    }
}

pub(super) fn compare_lookup(a: &Value, b: &Value) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    if let (Some(an), Some(bn)) = (coerce_to_number(a), coerce_to_number(b)) {
        an.partial_cmp(&bn).unwrap_or(Ordering::Equal)
    } else {
        coerce_to_text(a).cmp(&coerce_to_text(b))
    }
}
