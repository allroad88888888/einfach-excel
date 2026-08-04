//! `is_builtin_function_name` 保留名清单的源码提取。

use std::collections::BTreeSet;

use super::lex::{balanced, find, lex, Tok};

/// 公式名形状 —— 供调用方对抽取结果做逐项自检。
pub fn is_formula_name(n: &str) -> bool {
    let mut cs = n.chars();
    matches!(cs.next(), Some(c) if c.is_ascii_uppercase())
        && cs.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_' || c == '.')
}

/// 分段保留名表中每个 `matches!(...)` 体的字符区间。
fn reserved_macro_spans(s: &[char]) -> Vec<(usize, usize)> {
    let mut spans = Vec::new();
    let mut from = 0;
    while let Some(m) = find(s, "matches!(", from) {
        let open = find(s, "(", m).expect("matches! 后没有 (");
        let close = balanced(s, open, '(', ')');
        spans.push((open, close));
        from = close;
    }
    assert!(!spans.is_empty(), "找不到内建名称 matches!");
    spans
}

/// 所有 `matches!` 体的原文 —— 调用方用它检查有没有混进 `#[cfg]` 门控。
pub fn reserved_macro_body(s: &[char]) -> String {
    let mut body = String::new();
    for (open, close) in reserved_macro_spans(s) {
        body.extend(s[open..close].iter().copied());
        body.push('\n');
    }
    body
}

/// `is_builtin_function_name` 保留的全部名字。
pub fn reserved_names(s: &[char]) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for (open, close) in reserved_macro_spans(s) {
        let mut i = open;
        while i < close {
            match lex(s, i) {
                Tok::Str(lit, next) => {
                    out.insert(lit);
                    i = next;
                }
                Tok::Skip(next) => i = next,
                Tok::Plain => i += 1,
            }
        }
    }
    out
}
