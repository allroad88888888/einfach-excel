//! 判定一条公式会不会产出数组（溢出候选闸门）。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// Functions whose result can be a `Value::Array`.
///
/// SEQUENCE / UNIQUE / SORT / FILTER are the original dynamic-array
/// constructors. INDEX can also return a whole row or column. MAP / SCAN /
/// BYROW / BYCOL / MAKEARRAY are the L3 array higher-order functions added
/// alongside LAMBDA. REDUCE always returns a scalar so it's intentionally
/// omitted. ISOMITTED is a scalar predicate.
///
/// Kept ASCII-sorted so lookups can binary-search (pinned by
/// `array_function_names_sorted`). Shared by the AST gate
/// (`expr_may_produce_array`) and the parse-free source gate
/// (`source_may_produce_array`) so the two can never drift apart.
pub(super) const ARRAY_FUNCTION_NAMES: &[&str] = &[
    "BYCOL",
    "BYROW",
    "CHOOSECOLS",
    "CHOOSEROWS",
    "DROP",
    "EXPAND",
    "FILTER",
    "FREQUENCY",
    "GROWTH",
    "HSTACK",
    "INDEX",
    "LINEST",
    "LOGEST",
    "MAKEARRAY",
    "MAP",
    "MINVERSE",
    "MMULT",
    "MODE.MULT",
    "MUNIT",
    "RANDARRAY",
    "SCAN",
    "SEQUENCE",
    "SORT",
    "SORTBY",
    "TAKE",
    "TEXTSPLIT",
    "TOCOL",
    "TOROW",
    "TRANSPOSE",
    "TREND",
    "UNIQUE",
    "VSTACK",
    "WRAPCOLS",
    "WRAPROWS",
];

/// Conservative static check: does this AST contain a call to a
/// function that can produce a `Value::Array`? Used to gate the eager
/// spill re-eval — formulas that can't produce arrays stay fully lazy
/// and preserve the compatibility dirty-count / eval-count debug counters.
///
/// Currently any of `ARRAY_FUNCTION_NAMES`, or any function
/// that itself receives an array-producing call as an argument
/// (a `=SUM(SEQUENCE(5))`-shaped call needs to be detected so the array
/// produced inside collapses naturally; the outer scalar function eats
/// the array via `for_each_arg_value`, but the static check stays
/// conservative and flags any nested occurrence).
///
/// `pub(crate)` because `WorkbookLoader::flush` gates its projection tail on
/// it: the workbook loader already parsed every queued formula for the
/// cross-sheet cycle check, so it can ask the AST question directly and skip
/// `source_may_produce_array`'s byte scan + re-parse entirely.
pub(crate) fn expr_may_produce_array(expr: &Expr) -> bool {
    match expr {
        Expr::FuncCall { name, args } => {
            // The parser upper-cases function names, so an exact
            // binary-search hit is the whole test here.
            if ARRAY_FUNCTION_NAMES.binary_search(&name.as_str()).is_ok() {
                return true;
            }
            // 非内建名 = 可能是宿主自定义公式（Wave 8）或 LAMBDA 具名公式，
            // 两者都能返回 `Value::Array`，而它们的名字在编译期不可知 ——
            // 静态表里永远不会有。保守地放行，让 `recompute_array_formula`
            // 拿真实求值结果去判定；非数组结果在那里被原样丢弃。
            if !crate::eval::is_builtin_function_name(name) {
                return true;
            }
            args.iter().any(expr_may_produce_array)
        }
        Expr::BinOp { left, right, .. } => {
            // A binop now broadcasts when either operand is a multi-cell
            // range or array literal (eval.rs § `broadcast_binop`). Range
            // operands always produce multi-cell at the binop boundary,
            // so flag the binop as array-producing whenever an operand
            // is a `Range` / `SheetRange` — the broadcast path on the
            // eval side handles the single-cell range collapse so we
            // only over-flag, never under-flag.
            let operand_is_range =
                |e: &Expr| matches!(e, Expr::Range { .. } | Expr::SheetRange { .. });
            operand_is_range(left)
                || operand_is_range(right)
                || expr_may_produce_array(left)
                || expr_may_produce_array(right)
        }
        Expr::Negate(inner) | Expr::Percent(inner) => expr_may_produce_array(inner),
        // An immediate-call could be `MAP(...)(...)` chained, but even a
        // bare `LAMBDA(x, MAP(...))(arg)` returns an array. Descend the
        // callee + args conservatively.
        Expr::Call(callee, args) => {
            expr_may_produce_array(callee) || args.iter().any(expr_may_produce_array)
        }
        // Constant-array literal evaluates directly to `Value::Array`,
        // so a top-level `={1,2,3}` must take the eager spill re-eval
        // path just like a SEQUENCE / UNIQUE call would.
        Expr::ArrayLit { .. } => true,
        Expr::SpillRef(_) | Expr::DynamicRange { .. } => true,
        // A structured (Table) reference materializes its resolved region
        // as a `Value::Array` in value context, so a bare `=Table1[Col]`
        // must take the eager spill re-eval path (design doc §5.3).
        Expr::TableRef { .. } => true,
        // Multi-area evaluates to `#VALUE!` (error scalar) anywhere
        // other than as an `AREAS` argument — it never produces a
        // spillable `Value::Array`.
        Expr::MultiArea(_) => false,
        _ => false,
    }
}

/// Parse-free superset of `expr_may_produce_array`, run over raw formula
/// source text. Answers "is it worth parsing this source to ask the real
/// (AST) question?".
///
/// Exists because the storage-primary bulk install parks source text
/// without parsing it, yet still has to decide which of those formulas need
/// a spill projection (`install_bulk_spill_projections`). Parsing every
/// parked source to find out would reintroduce the per-cell parse that the
/// bulk path exists to avoid, so this filter drops the overwhelming
/// majority (`=A1*2`, `=SUM(A1:A9)`, `=IF(A1>0,B1,C1)`) with one byte scan.
///
/// It must never return `false` where `expr_may_produce_array` would return
/// `true`, so every AST shape that gate accepts is mapped back to a textual
/// marker that shape cannot exist without:
///
///   - a call to one of `ARRAY_FUNCTION_NAMES` → that identifier appears,
///   - `Expr::ArrayLit` (`={1,2}`) → `{`,
///   - `Expr::SpillRef` / `Expr::DynamicRange` (`=A1#`) → `#`,
///   - `Expr::TableRef` (`=Table1[Col]`) → `[`,
///   - a broadcasting `Expr::BinOp` over a range operand (`=A1:A3*2`) →
///     both a `:` and a binary-operator byte.
///
/// Over-flagging is free (the candidate just gets parsed and then rejected
/// by the AST gate); under-flagging would silently drop a spill, hence the
/// deliberately loose `#` / `[` / `{` tests.
pub(crate) fn source_may_produce_array(source: &str) -> bool {
    // Strip the formula intro so `=` isn't mistaken for a comparison
    // operator; Excel also accepts `+`/`-` as an intro.
    let body = source
        .strip_prefix('=')
        .or_else(|| source.strip_prefix('+'))
        .or_else(|| source.strip_prefix('-'))
        .unwrap_or(source);

    let bytes = body.as_bytes();
    let mut has_colon = false;
    let mut has_operator = false;
    let mut ident_start: Option<usize> = None;
    // One pass: collect the cheap markers and test every identifier token
    // against the array-function list. A function name is a whole token —
    // matching tokens rather than substrings keeps `MYSORT` / `SORTED` from
    // dragging unrelated formulas into the candidate set.
    for (i, &b) in bytes.iter().enumerate() {
        let is_ident = b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b >= 0x80;
        if is_ident {
            ident_start.get_or_insert(i);
            continue;
        }
        if let Some(start) = ident_start.take() {
            let token = &body[start..i];
            if is_array_function_token(token) {
                return true;
            }
            // 紧跟 `(` 的标识符就是一次函数调用。名字不在内建表里 → AST 门
            // (`expr_may_produce_array`) 会放行它（自定义公式 / LAMBDA 具名
            // 公式），这里必须同样放行，否则批量安装路径会静默漏掉溢出。
            if b == b'(' && !is_builtin_function_token(token) {
                return true;
            }
        }
        match b {
            b'{' | b'#' | b'[' => return true,
            b':' => has_colon = true,
            b'+' | b'-' | b'*' | b'/' | b'^' | b'&' | b'=' | b'<' | b'>' => has_operator = true,
            _ => {}
        }
    }
    if let Some(start) = ident_start {
        if is_array_function_token(&body[start..]) {
            return true;
        }
    }
    has_colon && has_operator
}

/// Case-insensitive whole-token membership test against
/// `ARRAY_FUNCTION_NAMES`. Source text keeps the author's casing, so
/// `=sequence(3)` has to hit as well as `=SEQUENCE(3)`.
pub(super) fn is_array_function_token(token: &str) -> bool {
    ARRAY_FUNCTION_NAMES
        .iter()
        .any(|name| name.eq_ignore_ascii_case(token))
}

/// 内建函数名的大小写无关、**零分配**判定。`is_builtin_function_name` 只认
/// 大写（解析器会先 upper-case），而这里扫的是保留了作者大小写的原始源码，
/// 所以要先归一。不能用 `to_ascii_uppercase()`：这条扫描跑在批量安装的每一条
/// 公式源码上（5M 单元格量级），每个函数名一次堆分配是不可接受的。
///
/// 当前最长的内建名是 `BINOM.DIST.RANGE` / `NETWORKDAYS.INTL`（16 字节），
/// 缓冲区取 32 留足余量；超长 token 必然不是内建名，返回 `false` 让调用方
/// 保守放行（保守 = 多解析一次，不会漏掉溢出）。
pub(super) fn is_builtin_function_token(token: &str) -> bool {
    const MAX_BUILTIN_NAME_LEN: usize = 32;
    let bytes = token.as_bytes();
    if bytes.is_empty() || bytes.len() > MAX_BUILTIN_NAME_LEN {
        return false;
    }
    let mut buf = [0u8; MAX_BUILTIN_NAME_LEN];
    for (dst, &src) in buf.iter_mut().zip(bytes) {
        *dst = src.to_ascii_uppercase();
    }
    // token 是从 `body` 的 char 边界切出来的，且只含 ASCII 时才可能命中内建表；
    // 含非 ASCII 字节的 token 走 `from_utf8` 失败 → 保守返回 false。
    std::str::from_utf8(&buf[..bytes.len()]).is_ok_and(crate::eval::is_builtin_function_name)
}
