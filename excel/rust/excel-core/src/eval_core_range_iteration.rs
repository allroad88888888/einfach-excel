use super::*;

/// Stream values produced by a function argument. For `Range` args this
/// goes through `provider.for_each_range_cell` (sparse-aware); for any
/// other expression it evaluates once and yields the single value. The
/// closure sees `(Option<addr>, value)` — `Some` for range cells, `None`
/// for evaluated sub-expressions — so callers like `SUMIF` can still
/// align `range`/`sum_range` by relative position when both are ranges.
///
/// Dynamic range expressions: if the argument is `OFFSET(...)`, it is
/// evaluated to a runtime `CellRange` and iterated cell-by-cell via the
/// provider — so `SUM(OFFSET(A1,0,0,5,1))` works like `SUM(A1:A5)`.
pub(super) fn for_each_arg_value(
    arg: &Expr,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(Option<CellAddress>, Value),
) {
    for_each_arg_value_indexed(arg, provider, &mut |addr, _pos, v| f(addr, v));
}

/// `COUNTBLANK` 的「算空」判据，作用在**已经发出来的**格子上（没发出来的空格
/// 走矩形差额，见 `"COUNTBLANK"` 那一臂）。
///
/// 空文本 `""` 也算空 —— 这是 Excel 的口径，也是本仓 TS 参考引擎的口径
/// （`evaluateSparseCountBlank`：`value.kind === 'blank' || (string && === '')`）。
/// 因此 `COUNTBLANK` **不是** `COUNTA` 的补集：`=""` 那一格 COUNTA 算它非空、
/// COUNTBLANK 算它空，同一格被两边都数进去。错误格两边都算「非空」。
pub(super) fn value_counts_as_blank(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::Text(s) => s.is_empty(),
        _ => false,
    }
}

/// 同一条流，但回调拿到的是「这个格子是区域里的第几个」—— 1-based、行主序的
/// **绝对位置**，而不是「这是第几个被发出来的格子」。
///
/// 两者在稠密 provider 上重合，在稀疏 provider 上不重合：`for_each_range_cell`
/// 的契约是**只发非空格**，所以用累加计数器当位置的写法会让空格不占位。
/// `A1=1 / A2 空 / A3=3` 时 `MATCH(3,A1:A3,0)` 因此答 2，而 Excel（和本仓的
/// TS 参考引擎）答 3 —— Excel 数的是区域内的绝对位置，空格照样占一格。
///
/// 谁该用这个而不是 [`for_each_arg_value`]：**把序号当结果交出去**的函数
/// （`MATCH` / `XMATCH` 的返回值、`SERIESSUM` 的系数指数），以及需要知道
/// **空格在哪 / 有几个**的函数（`COUNTBLANK` 的基数、`TEXTJOIN` 的补洞）。
/// 只做聚合、计数、排序的那一大批不需要 —— 它们的答案与空格占不占位无关。
///
/// 返回值见 [`for_each_arg_value_indexed`]：区域实参的**矩形格数**。
pub(super) fn for_each_arg_value_positioned(
    arg: &Expr,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(u64, Value),
) -> Option<u64> {
    for_each_arg_value_indexed(arg, provider, &mut |_addr, pos, v| f(pos, v))
}

/// [`for_each_arg_value`] 与 [`for_each_arg_value_positioned`] 共用的实现。
/// 实参**只解析一次**（`OFFSET` / `INDIRECT` / `INDEX` 这类动态区域的解析带
/// 求值副作用，解两遍既慢又可能不等价），两个外壳各取所需。
///
/// 返回**矩形格数**（`bounded_shape()` 的行 × 列），区域实参才有：它是「这个
/// 实参名义上覆盖多少格」，与「回调被调了几次」是两个数 —— 差额就是被稀疏
/// 遍历跳过的空格数。`COUNTBLANK` 靠这个差额闭式求解，不必物化空格。
/// 非区域实参（标量 / 数组字面量 / 求值出错）返回 `None`：它们的每个位置都
/// 发出来了，不存在洞，也就没有「矩形」这个概念。
pub(super) fn for_each_arg_value_indexed(
    arg: &Expr,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(Option<CellAddress>, u64, Value),
) -> Option<u64> {
    match runtime_ref_from_expr(arg, provider) {
        Ok(r) => for_each_ref_value_indexed(&r, provider, f),
        Err(ValueError::InvalidValue) => {
            let v = eval_expr_with_provider(arg, provider);
            if let Value::Array(arr) = v {
                for (i, elem) in arr.data.iter().enumerate() {
                    f(None, i as u64 + 1, elem.clone());
                }
            } else {
                f(None, 1, v);
            }
            None
        }
        Err(e) => {
            f(None, 1, Value::Error(e));
            None
        }
    }
}

/// 把**已经解析好**的区域引用按行主序流出来。[`for_each_arg_value_indexed`]
/// 解析完实参后就落到这里，跨表走 `for_each_sheet_range_cell`、同表走
/// `stream_range`、物化引用（`INDEX` / 溢出区）直接读数组 —— 三条只有这一份。
///
/// 直接进这里而不进 `for_each_arg_value_indexed` 的唯一理由：调用方**还需要
/// 引用本身**（`SUMIF` 三参要条件区的左上角来给求和区做偏移平移），而动态区域
/// 实参的解析带求值副作用，不能为了拿左上角再解析一遍。
///
/// 返回值同 [`for_each_arg_value_indexed`]：区域的**矩形格数**。
pub(super) fn for_each_ref_value_indexed(
    r: &RuntimeRef,
    provider: &dyn EvalProvider,
    f: &mut dyn FnMut(Option<CellAddress>, u64, Value),
) -> Option<u64> {
    let n = r.normalized();
    if let Some(arr) = &r.materialized {
        let (rows, cols) = arr.shape();
        for row in 0..rows {
            for col in 0..cols {
                let addr = CellAddress::new(n.start.row + row, n.start.col + col);
                let pos = row as u64 * cols as u64 + col as u64 + 1;
                f(
                    Some(addr),
                    pos,
                    arr.get(row, col).cloned().unwrap_or(Value::Null),
                );
            }
        }
        return Some(rows as u64 * cols as u64);
    }
    // 区域的形状。`bounded_shape` 已把整列 / 整行的 `u32::MAX` 哨兵夹到
    // Excel 网格上限，所以 `A:A` 得到 1048576×1、`1:1` 得到 1×16384。
    let shape = r.bounded_shape();
    let cols = shape.map_or(1u64, |(_, c)| c as u64);
    let mut emit = |addr: CellAddress, v: Value| {
        let dr = addr.row.saturating_sub(n.start.row) as u64;
        let dc = addr.col.saturating_sub(n.start.col) as u64;
        f(Some(addr), dr * cols + dc + 1, v);
    };
    match &r.sheet {
        Some(sheet) => provider.for_each_sheet_range_cell(sheet, r.range, &mut emit),
        None => stream_range(&r.range.start, &r.range.end, provider, &mut emit),
    }
    shape.map(|(rows, c)| rows as u64 * c as u64)
}
