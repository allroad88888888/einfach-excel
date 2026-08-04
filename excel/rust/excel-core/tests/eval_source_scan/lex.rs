//! 源码扫描器共用的最小词法工具。

/// 词法扫描的一步结果。
pub(super) enum Tok {
    /// 注释 / 字符字面量 / 生命周期 —— 跳到该索引继续。
    Skip(usize),
    /// 字符串字面量：(内容, 下一个索引)。
    Str(String, usize),
    /// 普通字符，调用方自行处理。
    Plain,
}

/// 在 `i` 处识别一个需要特殊处理的词法单元。
pub(super) fn lex(s: &[char], i: usize) -> Tok {
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
        // 原始字符串 r"..." / r#"..."#。
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
pub(super) fn find(s: &[char], needle: &str, from: usize) -> Option<usize> {
    let pat: Vec<char> = needle.chars().collect();
    (from..=s.len().saturating_sub(pat.len())).find(|&i| s[i..i + pat.len()] == pat[..])
}

/// 从 `open`（必须指向 `open_ch`）扫到配对的 `close_ch`，返回其索引。
pub(super) fn balanced(s: &[char], open: usize, open_ch: char, close_ch: char) -> usize {
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
