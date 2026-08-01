//! 从 `src/eval.rs` 的**源码文本**里抽取内建函数名。
//!
//! 只做这一件事：把 Rust 源码扫成「`eval_func` 分发了哪些名字」和「
//! `is_builtin_function_name` 保留了哪些名字」两个集合。断言留给调用方
//! （`tests/reserved_name_parity.rs`）。
//!
//! 为什么走文本而不是反射：`eval_func` 的分发表是一个 7000 行的 `match`，运行期
//! 没有任何数据结构能枚举它 —— 唯一的真相在源码里。
//!
//! 扫描必须是**括号 / 字符串 / 注释感知**的：eval.rs 的注释里满是 `"NAME"` 形状
//! 的字面量，臂体里也有；一个朴素正则会把它们一起收进来，或者被某个 `'` 吞掉
//! 半个文件。下面这个小词法器就是为此存在的。

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

/// 把 `src/eval.rs` 读成字符序列。按 `char` 而不是字节切分：文件注释里有
/// `—` `…` 这类多字节字符，按字节索引会在非边界处切开。
pub fn eval_rs_chars() -> Vec<char> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/eval.rs");
    fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("读不到 {}: {e}", path.display()))
        .chars()
        .collect()
}

/// 词法扫描的一步结果。
enum Tok {
    /// 注释 / 字符字面量 / 生命周期 —— 跳到该索引继续。
    Skip(usize),
    /// 字符串字面量：(内容, 下一个索引)。
    Str(String, usize),
    /// 普通字符，调用方自行处理。
    Plain,
}

/// 在 `i` 处识别一个「需要特殊处理」的词法单元。
///
/// 覆盖行注释、块注释、原始字符串、普通字符串（含转义）、字符字面量，以及 Rust
/// 生命周期 `'a` —— 后者必须与字符字面量区分，否则一个 `&'a str` 里的 `'` 会
/// 一路吞到下一个引号，吃掉中间所有分发臂。
fn lex(s: &[char], i: usize) -> Tok {
    let at = |k: usize| s.get(k).copied();
    match at(i) {
        Some('/') if at(i + 1) == Some('/') => {
            let mut j = i + 2;
            while j < s.len() && s[j] != '\n' {
                j += 1;
            }
            Tok::Skip(j)
        }
        Some('/') if at(i + 1) == Some('*') => {
            let mut j = i + 2;
            while j + 1 < s.len() && !(s[j] == '*' && s[j + 1] == '/') {
                j += 1;
            }
            Tok::Skip((j + 2).min(s.len()))
        }
        // 原始字符串 r"..." / r#"..."#
        Some('r') if matches!(at(i + 1), Some('"') | Some('#')) => {
            let mut j = i + 1;
            let mut hashes = 0usize;
            while at(j) == Some('#') {
                hashes += 1;
                j += 1;
            }
            if at(j) != Some('"') {
                return Tok::Plain;
            }
            let mut k = j + 1;
            loop {
                if k >= s.len() {
                    return Tok::Skip(s.len());
                }
                let closes = s[k] == '"'
                    && s[k + 1..]
                        .iter()
                        .take(hashes)
                        .filter(|c| **c == '#')
                        .count()
                        == hashes;
                if closes {
                    return Tok::Str(s[j + 1..k].iter().collect(), k + 1 + hashes);
                }
                k += 1;
            }
        }
        Some('"') => {
            let mut j = i + 1;
            let mut buf = String::new();
            while j < s.len() && s[j] != '"' {
                if s[j] == '\\' {
                    j += 2;
                    continue;
                }
                buf.push(s[j]);
                j += 1;
            }
            Tok::Str(buf, j + 1)
        }
        Some('\'') => {
            if at(i + 1) == Some('\\') {
                let mut j = i + 2;
                while j < s.len() && s[j] != '\'' {
                    j += 1;
                }
                Tok::Skip(j + 1)
            } else if at(i + 2) == Some('\'') {
                Tok::Skip(i + 3)
            } else {
                // 生命周期标注 —— 只吃掉这一个引号。
                Tok::Skip(i + 1)
            }
        }
        _ => Tok::Plain,
    }
}

/// 朴素子串查找（`&[char]` 上没有现成的 `find`）。
fn find(s: &[char], needle: &str, from: usize) -> Option<usize> {
    let pat: Vec<char> = needle.chars().collect();
    (from..=s.len().saturating_sub(pat.len())).find(|&i| s[i..i + pat.len()] == pat[..])
}

/// 从 `open`（必须指向 `open_ch`）扫到配对的 `close_ch`，返回其索引。
fn balanced(s: &[char], open: usize, open_ch: char, close_ch: char) -> usize {
    let mut depth = 0i32;
    let mut i = open;
    while i < s.len() {
        match lex(s, i) {
            Tok::Skip(next) | Tok::Str(_, next) => {
                i = next;
                continue;
            }
            Tok::Plain => {}
        }
        if s[i] == open_ch {
            depth += 1;
        } else if s[i] == close_ch {
            depth -= 1;
            if depth == 0 {
                return i;
            }
        }
        i += 1;
    }
    panic!("括号不配平：从 {open} 找 {close_ch}");
}

/// 公式名形状 —— 供调用方对抽取结果做逐项自检。
pub fn is_formula_name(n: &str) -> bool {
    let mut cs = n.chars();
    matches!(cs.next(), Some(c) if c.is_ascii_uppercase())
        && cs.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_' || c == '.')
}

/// `is_builtin_function_name` 的 `matches!(...)` 体的字符区间。
fn reserved_macro_span(s: &[char]) -> (usize, usize) {
    let f = find(s, "pub fn is_builtin_function_name", 0).expect("找不到 is_builtin_function_name");
    let m = find(s, "matches!(", f).expect("找不到 matches!(");
    let open = find(s, "(", m).expect("matches! 后没有 (");
    (open, balanced(s, open, '(', ')'))
}

/// `matches!` 体的原文 —— 调用方用它检查有没有混进 `#[cfg]` 门控。
pub fn reserved_macro_body(s: &[char]) -> String {
    let (open, close) = reserved_macro_span(s);
    s[open..close].iter().collect()
}

/// `is_builtin_function_name` 保留的全部名字。
pub fn reserved_names(s: &[char]) -> BTreeSet<String> {
    let (open, close) = reserved_macro_span(s);
    let mut out = BTreeSet::new();
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
    out
}

/// `eval_func` 顶层 `match name { ... }` 每条臂**模式部分**里的名字。
///
/// 状态机在 PATTERN / BODY 间切换：只有 PATTERN 态、且花括号 / 圆括号 / 方括号
/// 深度全为 0 时才收字符串。这样臂体内部的字面量（`fn_x(args, provider)` 里的、
/// `#[cfg(feature = "regex-formulas")]` 属性里的）一律收不到。
///
/// 注意：文本扫描看到的是**所有 cfg 配置的并集**，`REGEX*` 三个在 lite 构建下
/// 其实不存在。这是刻意的 —— 门禁盯的是源码同步，不是某一次构建的实际分发表。
pub fn dispatch_names(s: &[char]) -> BTreeSet<String> {
    let f = find(s, "fn eval_func(", 0).expect("找不到 eval_func");
    let m = find(s, "match name {", f).expect("eval_func 里找不到 `match name {`");
    let open = find(s, "{", m).expect("match name 后没有 {");
    let close = balanced(s, open, '{', '}');

    let (mut brace, mut paren, mut bracket) = (0i32, 0i32, 0i32);
    let mut in_pattern = true;
    let mut out = BTreeSet::new();
    let mut i = open + 1;
    while i < close {
        match lex(s, i) {
            Tok::Str(lit, next) => {
                if in_pattern && brace == 0 && paren == 0 && bracket == 0 {
                    out.insert(lit);
                }
                i = next;
                continue;
            }
            Tok::Skip(next) => {
                i = next;
                continue;
            }
            Tok::Plain => {}
        }
        match s[i] {
            '{' => brace += 1,
            '}' => {
                brace -= 1;
                // 块体闭合回顶层 = 该臂结束。
                if !in_pattern && brace == 0 {
                    in_pattern = true;
                }
            }
            '(' => paren += 1,
            ')' => paren -= 1,
            '[' => bracket += 1,
            ']' => bracket -= 1,
            '=' if in_pattern
                && s.get(i + 1) == Some(&'>')
                && brace == 0
                && paren == 0
                && bracket == 0 =>
            {
                in_pattern = false;
                i += 2;
                continue;
            }
            ',' if !in_pattern && brace == 0 && paren == 0 && bracket == 0 => in_pattern = true,
            _ => {}
        }
        i += 1;
    }
    out
}
