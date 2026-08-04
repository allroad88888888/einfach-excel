use super::*;

/// Match a value against a SUMIF/COUNTIF criterion. Supports:
/// - Bare values: equality
/// - Text starting with `>`, `<`, `>=`, `<=`, `<>`, `=` followed by a number
pub(super) fn matches_criterion(v: &Value, criterion: &Value) -> bool {
    let crit_text = coerce_to_text(criterion);
    // Try operator prefix forms first.
    let (op, rest) = parse_criterion_op(&crit_text);
    // 空格**不参与数值比较**。Excel 里 `COUNTIF(rng,0)` 数不到空格、
    // `SUMIFS(v,rng,">-1")` 也不把空格那一行算进来 —— 空格在判据眼里不是 0，
    // 它压根没有可比的数值。本仓 TS 参考引擎同口径（`numericComparable` 对
    // blank 返回 undefined，`scalarEquals` 里 blank 只与 blank / `""` 相等）。
    //
    // 这里刻意**不**复用 `coerce_to_number`：那个函数把 `Null` 当 0，是算术与
    // 两百多个内建函数要的口径（`=SUM(A1:A3)` 得把空格当 0），换掉会波及全仓。
    // 判据这一档单独把空格摘出去，于是空格只剩「文本兜底」和「通配符」两条路
    // 可走 —— 正好是 `""` / `"="` / `"<>x"` / `"<>*"` 命中而 `">0"` / `0` /
    // `"<5"` 不命中的那套分档。
    //
    // 过去这条判死的位置很隐蔽：稀疏遍历本来就不发空格，所以 `COUNTIF` 看不出
    // 差别；稠密遍历的 `SUMIFS` / `AVERAGEIFS` / `MAXIFS` / `MINIFS` 却会读到
    // 空格，于是 `SUMIFS(B1:B3,A1:A3,">-1")` 在 A2 空时多加了 B2 —— 同一个
    // 判据在同一个引擎里有两种答案。
    let numeric_comparable = !matches!(v, Value::Null);
    if let (true, Ok(target_n)) = (numeric_comparable, rest.parse::<f64>()) {
        if let Some(vn) = coerce_to_number(v) {
            return match op {
                ">" => vn > target_n,
                ">=" => vn >= target_n,
                "<" => vn < target_n,
                "<=" => vn <= target_n,
                "<>" => vn != target_n,
                _ => vn == target_n,
            };
        }
    }
    // Excel wildcard semantics: ? = 1 char, * = 0+ chars, ~ escapes the next char.
    // Wildcards apply only to the "rest" (after any operator prefix). `=` and
    // `<>` honor wildcards (match / not-match); comparison operators (`>`,
    // `<`, `>=`, `<=`) fall through to text equality (existing legacy
    // behavior — those forms don't apply meaningfully to text patterns).
    //
    // 通配符判据**只匹配文本格**。数字 / 布尔 / 错误 / 空格都不是文本，一律
    // 不命中 —— 于是 `"*"` 数的正是文本格个数，`"<>*"` 是它在整个区域上的
    // 严格补集。依据是 Exceljet「Count cells that contain text」：
    // “Empty cells and cells that contain numeric values or errors should not
    // be included in the count.”，同页的 `=COUNTIF(data,"<>*")` 在同一个 11
    // 格区域上回 7、`"*"` 回 4，两者严格互补。
    //
    // 这里曾经先 `coerce_to_text(v)` 再匹配，于是 `"*"` 把数字、布尔、错误格
    // 全数了进去（8 格夹具上回 8 而不是 5），`"<>*"` 相应地恒为 0。
    //
    // 与「条件字符串里写错误码」（`"#N/A"`）不冲突：那一档**不带**通配符，走
    // 下面的文本兜底，错误格在那里按显示文本参与比较。一个看模式里有没有
    // `?`/`*`/`~`，一个看值的种类 —— 别把两档合并。
    if pattern_has_wildcard(rest) {
        let matched = match criterion_cell_text(v) {
            Some(text) => wildcard_match(rest, &text),
            None => false,
        };
        return match op {
            "<>" => !matched,
            // Comparison operators against a wildcard pattern fall back to
            // equality semantics (Excel does the same).
            _ => matched,
        };
    }
    // Fallback: text comparison (Excel-compatible default) for any `op` the
    // numeric / wildcard branches above didn't take.
    //
    // `<>` 必须是真的「不等于」。这里曾经无视 op 直接回 `text == rest`，于是
    // `COUNTIF(rng,"<>apple")` 回的是**等于** apple 的个数，正好反过来；
    // `"<>#N/A"` 这条标准错误过滤配方也因此拿不到正确答案。
    //
    // 注意这一档同时承载「条件字符串里写错误码」：`coerce_to_text` 把
    // `Value::Error` 渲染成 `#N/A` / `#DIV/0!`，所以 `"#N/A"` 命中错误格、
    // `"<>#N/A"` 命中除它以外的一切。这与「criteria 实参**本身**是错误值」
    // 是两回事 —— 那一档在各调用点求值后就直接传播，走不到 `matches_criterion`。
    //
    // 比较**不区分大小写**。MS 官方 COUNTIF 文档原话：“Criteria aren't case
    // sensitive. In other words, the string "apples" and the string "APPLES"
    // will match the same cells.” 这里曾经是逐字节 `==`，于是
    // `COUNTIF(rng,"APPLE")` 数不到内容为 `apple` 的格子 —— 而上面的通配符档
    // 一直是不敏感的（`wildcard_match` 两侧都折成小写），同一个函数里两套口径。
    //
    // 别拿 `EXACT()` 来推翻这条：那个函数**区分**大小写，正是 criteria 做不到
    // 大小写敏感时的标准替代写法（`SUMPRODUCT(--EXACT(rng,"APPLE"))`）。
    let cell_text = coerce_to_text(v);
    // 先走逐字节相等的快路径，绝大多数格子在这里就判完，不必分配两个小写串。
    let equal = cell_text == rest || cell_text.to_lowercase() == rest.to_lowercase();
    match op {
        "<>" => !equal,
        _ => equal,
    }
}

/// 通配符判据眼里的「文本格」。
///
/// 只有 `Value::Text` 算文本 —— 数字、布尔、错误、空格一律 `None`，于是
/// `matches_criterion` 的通配符档对它们不命中。数组按本文件既有约定塌成左上角
/// （与 `coerce_to_text` 同形）。
///
/// 刻意**不**复用 `coerce_to_text`：那个函数会把 `5` 渲染成 `"5"`、把 `#N/A`
/// 渲染成 `"#N/A"`，正是本次要去掉的行为。
pub(super) fn criterion_cell_text(v: &Value) -> Option<String> {
    match v {
        Value::Text(s) => Some(s.clone()),
        Value::Array(arr) => arr.get(0, 0).and_then(criterion_cell_text),
        _ => None,
    }
}

pub(super) fn parse_criterion_op(s: &str) -> (&str, &str) {
    for op in ["<>", ">=", "<=", ">", "<", "="] {
        if let Some(rest) = s.strip_prefix(op) {
            return (op, rest);
        }
    }
    ("=", s)
}

/// Detect whether a pattern is "wildcard-style". A pattern is wildcard-style
/// if it contains an unescaped `?`/`*` OR any `~` escape sequence — the
/// escape sequence itself needs the wildcard matcher to decode it (e.g.
/// `~*` is a literal `*` only after escape resolution; a plain string
/// compare against the raw pattern would still see the `~`).
pub(super) fn pattern_has_wildcard(pattern: &str) -> bool {
    let mut chars = pattern.chars();
    while let Some(c) = chars.next() {
        if c == '~' {
            // A `~` always triggers the wildcard matcher so escapes are
            // decoded uniformly. Consume the escaped char and continue.
            let _ = chars.next();
            return true;
        }
        if c == '?' || c == '*' {
            return true;
        }
    }
    false
}

/// Excel wildcard semantics: `?` = exactly one char, `*` = zero-or-more
/// chars, `~` escapes the next char (`~?`, `~*`, `~~`). Match is
/// case-insensitive (Excel convention; same as SEARCH).
///
/// Implementation: iterative two-pointer matcher with `*` backtracking. The
/// pattern is pre-decoded into a token vector (`Lit(c) | Q | Star`) so the
/// matcher itself only deals with three cases. Time complexity is O(p·t)
/// in the worst case (multiple `*`s with backtracking); criteria patterns
/// are short in practice so this is fine.
pub(super) fn wildcard_match(pattern: &str, text: &str) -> bool {
    enum Tok {
        Lit(char),
        Q,
        Star,
    }
    // Decode pattern → tokens, honoring `~` escape. Case-folded to lower.
    let mut toks: Vec<Tok> = Vec::with_capacity(pattern.len());
    let mut it = pattern.chars();
    while let Some(c) = it.next() {
        if c == '~' {
            // Escape: the next char is a literal (any char; `~` at end is
            // treated as a literal `~`, matching Excel parity).
            match it.next() {
                Some(next) => toks.push(Tok::Lit(next.to_lowercase().next().unwrap_or(next))),
                None => toks.push(Tok::Lit('~')),
            }
        } else if c == '?' {
            toks.push(Tok::Q);
        } else if c == '*' {
            toks.push(Tok::Star);
        } else {
            toks.push(Tok::Lit(c.to_lowercase().next().unwrap_or(c)));
        }
    }
    // Case-fold the text too.
    let text_chars: Vec<char> = text.chars().flat_map(|c| c.to_lowercase()).collect();

    // Two-pointer matcher with `*` backtracking. `star_p` is the index of
    // the most recent `*` in the pattern (or None); `star_t` is the text
    // index where that `*` last attempted to "start eating".
    let mut p = 0usize;
    let mut t = 0usize;
    let mut star_p: Option<usize> = None;
    let mut star_t: usize = 0;
    while t < text_chars.len() {
        match toks.get(p) {
            Some(Tok::Lit(c)) if text_chars[t] == *c => {
                p += 1;
                t += 1;
            }
            Some(Tok::Q) => {
                p += 1;
                t += 1;
            }
            Some(Tok::Star) => {
                star_p = Some(p);
                star_t = t;
                p += 1;
            }
            _ => {
                // Mismatch or end-of-pattern with text remaining. Try to
                // backtrack to the last `*` and let it consume one more char.
                if let Some(sp) = star_p {
                    p = sp + 1;
                    star_t += 1;
                    t = star_t;
                } else {
                    return false;
                }
            }
        }
    }
    // Consume any trailing `*`s; anything else means leftover required
    // tokens that have no text to match against.
    while let Some(Tok::Star) = toks.get(p) {
        p += 1;
    }
    p == toks.len()
}

// --- TEXTSPLIT / TEXTBEFORE / TEXTAFTER / LOOKUP / FORMULATEXT / AREAS / ENCODEURL
//     helpers. The arms in `eval_func` are intentionally thin (`fn_*`-call
//     style) so the bulk of the new logic sits below, near the other text /
//     lookup helpers, instead of bloating the giant `match`.

/// Collect a Vec<String> of delimiters from a TEXTSPLIT argument: a scalar
/// becomes a single element, a `Value::Array` is flattened in row-major
/// order. Empty / Null array slots are silently dropped — TEXTSPLIT can't
/// split on an empty string anyway, and Excel ignores blanks in the
/// delimiter array.
// 单元测试。原来是一个 17,375 行的内联 `mod tests`（占本文件 43.7%），现按
// **被测的东西**（函数族）拆到 `eval_tests/` 下，每个文件一件事。与
// `eval_regex_tests.rs` / `formula/*_tests.rs` 同一个约定：`#[path]` 挂在实现
// 文件上，`tests` 仍是 `eval` 的子模块，因此拿得到本模块的私有项。
#[cfg(test)]
#[path = "eval_tests/mod.rs"]
mod tests;
