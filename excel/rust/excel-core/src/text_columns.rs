//! 单元格文本分列：只拆字段，不负责读写工作簿或推断字段类型。
//! 与 CSV 文件不同，单元格内换行仍属于同一条记录，不能被拆成新行。
use crate::sheet::EXCEL_MAX_COLS;

pub const MAX_TEXT_COLUMN_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TextColumnsMode {
    Delimited {
        delimiters: Vec<char>,
        merge_consecutive: bool,
        qualifier: Option<char>,
    },
    /// 按 Unicode 标量值标记切点，不按 UTF-8 字节切片。
    FixedWidth { breakpoints: Vec<usize> },
}

impl TextColumnsMode {
    pub fn validate(&self) -> Result<(), &'static str> {
        match self {
            Self::Delimited {
                delimiters,
                qualifier,
                ..
            } => {
                if delimiters.is_empty() {
                    return Err("Choose at least one delimiter.");
                }
                if qualifier.is_some_and(|value| delimiters.contains(&value)) {
                    return Err("The text qualifier cannot also be a delimiter.");
                }
            }
            Self::FixedWidth { breakpoints } => {
                if breakpoints.is_empty() || breakpoints[0] == 0 {
                    return Err("Choose positive fixed-width break positions.");
                }
                if breakpoints.windows(2).any(|pair| pair[0] >= pair[1]) {
                    return Err("Fixed-width break positions must increase without duplicates.");
                }
                if breakpoints.len() >= EXCEL_MAX_COLS as usize {
                    return Err("Split output exceeds the worksheet column limit.");
                }
            }
        }
        Ok(())
    }
}

/// 预览与应用共用同一个分词器；错误整次返回，不把部分字段当作成功结果。
pub fn split_text_columns(text: &str, mode: &TextColumnsMode) -> Result<Vec<String>, &'static str> {
    mode.validate()?;
    if text.len() > MAX_TEXT_COLUMN_BYTES {
        return Err("A source cell exceeds 16 MiB. Choose smaller text.");
    }
    match mode {
        TextColumnsMode::FixedWidth { breakpoints } => {
            let mut fields = Vec::with_capacity(breakpoints.len() + 1);
            let mut current = String::new();
            let mut next = 0;
            for (position, character) in text.chars().enumerate() {
                if breakpoints.get(next) == Some(&position) {
                    fields.push(std::mem::take(&mut current));
                    next += 1;
                }
                current.push(character);
            }
            fields.push(current);
            // 短记录也保留其余空字段，以便预览与矩形写入保持相同列数。
            fields.resize(breakpoints.len() + 1, String::new());
            Ok(fields)
        }
        TextColumnsMode::Delimited {
            delimiters,
            merge_consecutive,
            qualifier,
        } => split_delimited(text, delimiters, *merge_consecutive, *qualifier),
    }
}

fn split_delimited(
    text: &str,
    delimiters: &[char],
    merge_consecutive: bool,
    qualifier: Option<char>,
) -> Result<Vec<String>, &'static str> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut field_start = true;
    let mut characters = text.chars().peekable();
    while let Some(character) = characters.next() {
        if Some(character) == qualifier {
            if quoted {
                if characters.peek() == Some(&character) {
                    current.push(character);
                    characters.next();
                } else {
                    quoted = false;
                }
                continue;
            }
            if field_start {
                quoted = true;
                field_start = false;
                continue;
            }
        }
        if !quoted && delimiters.contains(&character) {
            if fields.len() + 1 >= EXCEL_MAX_COLS as usize {
                return Err("Split output exceeds the worksheet column limit.");
            }
            fields.push(std::mem::take(&mut current));
            field_start = true;
            if merge_consecutive {
                while characters
                    .peek()
                    .is_some_and(|next| delimiters.contains(next))
                {
                    characters.next();
                }
            }
        } else {
            current.push(character);
            field_start = false;
        }
    }
    if quoted {
        return Err("A text qualifier is not closed. Correct the text or choose no qualifier.");
    }
    fields.push(current);
    Ok(fields)
}

#[cfg(test)]
#[path = "text_columns_tests.rs"]
mod tests;
