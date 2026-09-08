//! 字面量匹配使用原字符串边界；对外的匹配位置统一换算为 UTF-16。
use std::ops::Range;

pub(crate) struct FindText {
    needle: String,
    case_sensitive: bool,
    whole_cell: bool,
}

impl FindText {
    pub(crate) fn new(
        needle: &str,
        case_sensitive: bool,
        whole_cell: bool,
    ) -> Result<Self, &'static str> {
        if needle.is_empty() || needle.len() > 4096 {
            return Err("Enter a search string of 1–4096 UTF-8 bytes.");
        }
        Ok(Self {
            needle: if case_sensitive {
                needle.into()
            } else {
                needle.chars().flat_map(char::to_lowercase).collect()
            },
            case_sensitive,
            whole_cell,
        })
    }

    pub(crate) fn spans(&self, text: &str) -> Vec<Range<usize>> {
        if self.case_sensitive {
            return self.match_spans(text);
        }
        // 大小写转换可能扩展字符（例如 İ）；只接受完整原字符的边界，
        // 不把转换后的 UTF-8 字节位置直接用来截取原字符串。
        let mut folded = String::new();
        let mut boundaries = Vec::new();
        for (byte, ch) in text.char_indices() {
            boundaries.push((folded.len(), byte));
            folded.extend(ch.to_lowercase());
        }
        boundaries.push((folded.len(), text.len()));
        self.match_spans(&folded)
            .into_iter()
            .filter_map(|span| {
                let start = boundaries.binary_search_by_key(&span.start, |b| b.0).ok()?;
                let end = boundaries.binary_search_by_key(&span.end, |b| b.0).ok()?;
                Some(boundaries[start].1..boundaries[end].1)
            })
            .collect()
    }

    fn match_spans(&self, text: &str) -> Vec<Range<usize>> {
        if self.whole_cell {
            return if text == self.needle {
                vec![0..text.len()]
            } else {
                Vec::new()
            };
        }
        text.match_indices(&self.needle)
            .map(|(start, matched)| start..start + matched.len())
            .collect()
    }
}

pub(crate) fn utf16_span(text: &str, span: &Range<usize>) -> Range<usize> {
    text[..span.start].encode_utf16().count()..text[..span.end].encode_utf16().count()
}
