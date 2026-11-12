// 单格快照 wire：原始显示、Rust 格式化显示（文本/段颜色/填充）与单格元数据。
#[derive(Clone, Debug, Serialize)]
struct CellSnapshotJSON {
    sheet: usize,
    addr: String,
    display: String,
    #[serde(rename = "formattedDisplay", skip_serializing_if = "Option::is_none")]
    formatted_display: Option<String>,
    /// 自定义格式段颜色（`#rrggbb`），覆盖用户字体色；条件格式字体色仍优先。
    #[serde(rename = "formattedColor", skip_serializing_if = "Option::is_none")]
    formatted_color: Option<String>,
    #[serde(rename = "formattedFill", skip_serializing_if = "Option::is_none")]
    formatted_fill: Option<FormattedCharJSON>,
    /// `_x` 留白：文本里是空格，渲染器在该位置留出 `char` 的宽度。
    #[serde(rename = "formattedPads", skip_serializing_if = "Option::is_none")]
    formatted_pads: Option<Vec<FormattedCharJSON>>,
    #[serde(rename = "inputText")]
    input_text: String,
    #[serde(rename = "type")]
    cell_type: String,
    #[serde(rename = "isError")]
    is_error: bool,
    formula: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    hyperlink: Option<String>,
    #[serde(rename = "richText", skip_serializing_if = "Option::is_none")]
    rich_text: Option<Vec<einfach_excel_core::rich_text::RichTextRun>>,
    #[serde(rename = "noteIndicator", skip_serializing_if = "Option::is_none")]
    note_indicator: Option<bool>,
    #[serde(rename = "commentIndicator", skip_serializing_if = "Option::is_none")]
    comment_indicator: Option<bool>,
}

/// `*x` 填充或 `_x` 留白：`at` 是 `formattedDisplay` 中的字符下标。
#[derive(Clone, Debug, PartialEq, Serialize)]
struct FormattedCharJSON {
    #[serde(rename = "char")]
    ch: String,
    at: usize,
}

/// Rust 给出的格式化显示：文本、段颜色与填充位置一起返回，网格不再自己格式化。
#[derive(Clone, Debug, Default, PartialEq)]
struct NativeNumberDisplay {
    text: String,
    color: Option<String>,
    fill: Option<FormattedCharJSON>,
    pads: Vec<FormattedCharJSON>,
}

impl CellSnapshotJSON {
    fn with_native(mut self, native: Option<NativeNumberDisplay>) -> Self {
        if let Some(native) = native {
            self.formatted_display = Some(native.text);
            self.formatted_color = native.color;
            self.formatted_fill = native.fill;
            self.formatted_pads = (!native.pads.is_empty()).then_some(native.pads);
        }
        self
    }
}

/// 原生格式文本与原始数值分开返回；display 仍供统计与输入使用。
fn native_number_display(
    workbook: &Workbook, sheet: usize, addr: &str, value: &Value,
) -> Option<NativeNumberDisplay> {
    let value = collapse_array_for_js(value);
    let format = workbook.sheet(sheet)?.get_format(addr);
    native_number_display_for_value(&format, value.as_ref())
}

/// 网格与自动尺寸共用同一份格式化结果，包括文本段与字符留白。
fn native_number_display_for_value(format: &CellFormat, value: &Value) -> Option<NativeNumberDisplay> {
    if let NumberFormat::Accounting { symbol, digits } = &format.number_format {
        let Value::Number(number) = value else { return None };
        return einfach_excel_core::accounting_format::display(symbol, *digits, *number)
            .map(NativeNumberDisplay::from);
    }
    if let NumberFormat::Custom(pattern) = &format.number_format {
        let shown = match value {
            Value::Number(number) => einfach_excel_core::custom_number_format::format_number(pattern, *number)
                .unwrap_or_else(|| einfach_excel_core::custom_number_format::CustomFormatted {
                    text: format.format_number(*number), color: None, fill: None, pads: Vec::new(),
                }),
            Value::Text(text) => einfach_excel_core::custom_number_format::format_text(pattern, text)?,
            _ => return None,
        };
        return Some(NativeNumberDisplay::from(shown));
    }
    let Value::Number(number) = value else { return None };
    uses_native_number_display(&format.number_format).then(|| NativeNumberDisplay {
        text: format.format_number(*number), ..Default::default()
    })
}

impl From<einfach_excel_core::custom_number_format::CharMark> for FormattedCharJSON {
    fn from(mark: einfach_excel_core::custom_number_format::CharMark) -> Self {
        FormattedCharJSON { ch: mark.ch.to_string(), at: mark.at }
    }
}

impl From<einfach_excel_core::custom_number_format::CustomFormatted> for NativeNumberDisplay {
    fn from(shown: einfach_excel_core::custom_number_format::CustomFormatted) -> Self {
        NativeNumberDisplay {
            text: shown.text,
            color: shown.color,
            fill: shown.fill.map(FormattedCharJSON::from),
            pads: shown.pads.into_iter().map(FormattedCharJSON::from).collect(),
        }
    }
}
