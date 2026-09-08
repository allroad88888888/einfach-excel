//! 查找通配符返回非重叠、最左最长的原文区间；不使用指数回溯或引入正则运行时。
use std::ops::Range;

enum Token {
    Text(String),
    One,
    Many,
}

pub(crate) struct FindWildcard {
    tokens: Vec<Token>,
    case_sensitive: bool,
    whole_cell: bool,
}

impl FindWildcard {
    pub(crate) fn new(pattern: &str, case_sensitive: bool, whole_cell: bool) -> Self {
        let mut tokens = Vec::new();
        let mut literal = String::new();
        let mut chars = pattern.chars().peekable();
        while let Some(ch) = chars.next() {
            if ch == '~' && chars.peek().is_some_and(|ch| matches!(ch, '*' | '?' | '~')) {
                literal.push(chars.next().unwrap());
            } else if ch == '*' || ch == '?' {
                if !literal.is_empty() {
                    tokens.push(Token::Text(Self::fold(&literal, case_sensitive)));
                    literal.clear();
                }
                if ch == '?' {
                    tokens.push(Token::One);
                } else if !matches!(tokens.last(), Some(Token::Many)) {
                    tokens.push(Token::Many);
                }
            } else {
                literal.push(ch);
            }
        }
        if !literal.is_empty() {
            tokens.push(Token::Text(Self::fold(&literal, case_sensitive)));
        }
        Self {
            tokens,
            case_sensitive,
            whole_cell,
        }
    }

    fn fold(text: &str, case_sensitive: bool) -> String {
        if case_sensitive {
            text.into()
        } else {
            text.chars().flat_map(char::to_lowercase).collect()
        }
    }

    pub(crate) fn spans(&self, text: &str) -> Result<Vec<Range<usize>>, &'static str> {
        // DP 两行内存；先限制最坏工作量，超限明确失败，不能卡死 Worker 或截断替换。
        let cost: usize = self
            .tokens
            .iter()
            .map(|token| match token {
                Token::Text(value) => value.len() + 1,
                _ => 1,
            })
            .sum();
        if text.len().saturating_add(1).saturating_mul(cost) > 16_000_000 {
            return Err("Wildcard search is too complex for this cell. Use a shorter pattern or literal text.");
        }
        let mut folded = String::new();
        let mut original = Vec::new();
        let mut boundaries = Vec::new();
        for (byte, ch) in text.char_indices() {
            original.push(byte);
            boundaries.push(folded.len());
            if self.case_sensitive {
                folded.push(ch)
            } else {
                folded.extend(ch.to_lowercase())
            }
        }
        original.push(text.len());
        boundaries.push(folded.len());
        let n = original.len() - 1;
        // end[i] 是从第 i 个原字符开始，剩余模式能匹配到的最远原字符边界。
        // literal 匹配后必须落在完整原字符边界，? 因而始终消耗一个原字符（包括 emoji）。
        let mut end: Vec<Option<usize>> = (0..=n).map(Some).collect();
        let mut next = vec![None; n + 1];
        for token in self.tokens.iter().rev() {
            next.fill(None);
            for i in (0..=n).rev() {
                next[i] = match token {
                    Token::Many => end[i].max(if i < n { next[i + 1] } else { None }),
                    Token::One => {
                        if i < n {
                            end[i + 1]
                        } else {
                            None
                        }
                    }
                    Token::Text(literal) => {
                        let start = boundaries[i];
                        if folded[start..].starts_with(literal) {
                            boundaries
                                .binary_search(&(start + literal.len()))
                                .ok()
                                .and_then(|j| end[j])
                        } else {
                            None
                        }
                    }
                };
            }
            std::mem::swap(&mut end, &mut next);
        }
        if self.whole_cell {
            return Ok(if n > 0 && end[0] == Some(n) {
                vec![0..text.len()]
            } else {
                Vec::new()
            });
        }
        let mut spans = Vec::new();
        let mut i = 0;
        while i < n {
            if let Some(j) = end[i].filter(|j| *j > i) {
                spans.push(original[i]..original[j]);
                i = j;
            } else {
                i += 1
            }
        }
        Ok(spans)
    }
}
