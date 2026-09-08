//! 系统剪贴板 TSV 的引号/换行解析；类型转换只发生在 Rust。

use super::*;

pub(super) fn push_field(out: &mut String, field: &str) {
    if field.contains(['\t', '\n', '\r', '"']) {
        out.push('"');
        out.push_str(&field.replace('"', "\"\""));
        out.push('"');
    } else {
        out.push_str(field);
    }
}

impl ClipboardSnapshot {
    /// 接受普通矩形/不齐行文本；短行补空格，末尾一个行终止符不多建一行。
    pub fn from_tsv(text: &str, mode: ClipboardPasteMode) -> Result<Self, ClipboardError> {
        if matches!(
            mode,
            ClipboardPasteMode::Formats | ClipboardPasteMode::ValuesAndFormats
        ) {
            return Err("CLIPBOARD_NO_FORMATS");
        }
        if text.len() > MAX_CLIPBOARD_TEXT_BYTES {
            return Err("CLIPBOARD_TOO_LARGE");
        }
        let mut rows = Vec::new();
        let mut row = Vec::new();
        let mut field = String::new();
        let mut quoted = false;
        let mut closed_quote = false;
        let mut field_count = 1u64;
        let mut chars = text.chars().peekable();
        while let Some(ch) = chars.next() {
            if quoted {
                if ch == '"' {
                    if chars.peek() == Some(&'"') {
                        field.push('"');
                        chars.next();
                    } else {
                        quoted = false;
                        closed_quote = true;
                    }
                } else {
                    field.push(ch);
                }
                continue;
            }
            if ch == '\t' || ch == '\n' || ch == '\r' {
                field_count += 1;
                if field_count > MAX_CLIPBOARD_CELLS + 1 {
                    return Err("CLIPBOARD_TOO_LARGE");
                }
            }
            match ch {
                '"' if field.is_empty() && !closed_quote => quoted = true,
                '\t' => {
                    row.push(std::mem::take(&mut field));
                    closed_quote = false;
                }
                '\r' | '\n' => {
                    if ch == '\r' && chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    row.push(std::mem::take(&mut field));
                    rows.push(std::mem::take(&mut row));
                    closed_quote = false;
                }
                _ if closed_quote => return Err("CLIPBOARD_INVALID_TSV"),
                _ => field.push(ch),
            }
        }
        if quoted {
            return Err("CLIPBOARD_INVALID_TSV");
        }
        if !field.is_empty() || !row.is_empty() || rows.is_empty() || closed_quote {
            row.push(field);
            rows.push(row);
        }
        let cols = rows.iter().map(Vec::len).max().unwrap_or(1);
        let source = CellRange::new(
            CellAddress::new(0, 0),
            CellAddress::new(rows.len() as u32 - 1, cols as u32 - 1),
        );
        validate_range(source)?;
        let mut cells = Vec::with_capacity(source.cell_count() as usize);
        for row in rows {
            for col in 0..cols {
                cells.push(ClipboardCell {
                    value: parse_input(row.get(col).map(String::as_str).unwrap_or(""), mode)?,
                    format: None,
                });
            }
        }
        Ok(Self {
            source_sheet: None,
            source,
            cut: false,
            cells,
            text: text.into(),
        })
    }
}

fn parse_input(input: &str, mode: ClipboardPasteMode) -> Result<ClipboardValue, ClipboardError> {
    use crate::cell_input::{parse_cell_input, CellInput};
    match parse_cell_input(input, mode != ClipboardPasteMode::Values) {
        CellInput::Formula(source) => {
            crate::parse_formula(&source).ok_or("CLIPBOARD_INVALID_FORMULA")?;
            Ok(ClipboardValue::Formula {
                source,
                evaluated: None,
            })
        }
        CellInput::Literal(value) => Ok(ClipboardValue::Literal(value)),
        // 纯文本粘贴仍保留目标格式，只复用百分比的数值识别。
        CellInput::Percentage { value, .. } => Ok(ClipboardValue::Literal(Value::Number(value))),
    }
}
