//! 分派路由与真实函数臂的源码提取。

use std::collections::BTreeSet;

use super::lex::{balanced, find, lex, Tok};

/// 一次源码分派扫描的结果。
#[derive(Debug, Default)]
pub struct DispatchScan {
    pub arm_count: usize,
    pub names: BTreeSet<String>,
}

impl DispatchScan {
    fn extend(&mut self, other: DispatchScan) {
        self.arm_count += other.arm_count;
        self.names.extend(other.names);
    }
}

/// 扫一个顶层 `match name { ... }`：只收集模式部分的字符串字面量。
fn scan_match(s: &[char], match_start: usize) -> DispatchScan {
    let open = find(s, "{", match_start).expect("match name 后没有 {");
    let close = balanced(s, open, '{', '}');
    let (mut brace, mut paren, mut bracket) = (0i32, 0i32, 0i32);
    let (mut in_pattern, mut arm_has_name) = (true, false);
    let mut out = DispatchScan::default();
    let mut i = open + 1;

    while i < close {
        match lex(s, i) {
            Tok::Str(lit, next) => {
                if in_pattern && brace == 0 && paren == 0 && bracket == 0 {
                    arm_has_name = true;
                    out.names.insert(lit);
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
                if arm_has_name {
                    out.arm_count += 1;
                }
                arm_has_name = false;
                in_pattern = false;
                i += 2;
                continue;
            }
            ',' if !in_pattern && brace == 0 && paren == 0 && bracket == 0 => {
                in_pattern = true;
            }
            _ => {}
        }
        i += 1;
    }
    out
}

/// `eval_fn_*` 子模块中的实际函数臂；根路由不会被作为实际实现计入。
pub fn actual_dispatches(sources: &[Vec<char>]) -> DispatchScan {
    let mut out = DispatchScan::default();
    for source in sources {
        let mut from = 0;
        while let Some(function) = find(source, "pub(super) fn eval_fn_", from) {
            let match_start = find(source, "match name {", function)
                .expect("eval_fn_* 里找不到 `match name {`");
            out.extend(scan_match(source, match_start));
            from = match_start + "match name {".chars().count();
        }
    }
    out
}

/// 根 `eval_func` 的路由选择器；它必须与子模块的实际函数名集合严格一致。
pub fn routing_selectors(root: &[char]) -> DispatchScan {
    let function = find(root, "fn eval_func(", 0).expect("找不到 eval_func");
    let match_start = find(root, "match name {", function)
        .expect("eval_func 里找不到 `match name {`");
    scan_match(root, match_start)
}
