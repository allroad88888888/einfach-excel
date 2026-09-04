use crate::format::{Align, CellBorders, CellFormat, NumberFormat, Rotation, VerticalAlign};

/// 一层稀疏的显示样式；`None` 表示该层不接管这个属性。
///
/// `font_size`、颜色和字体族使用双层 `Option`：外层表示是否接管，内层
/// 表示具体值；`Some(None)` 因而能表达“明确清除上层颜色”。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CellStyle {
    pub number_format: Option<NumberFormat>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub align: Option<Align>,
    pub font_size: Option<Option<u32>>,
    pub color: Option<Option<String>>,
    pub background: Option<Option<String>>,
    pub font_family: Option<Option<String>>,
    pub underline: Option<bool>,
    pub strikethrough: Option<bool>,
    pub wrap_text: Option<bool>,
    pub indent: Option<u8>,
    pub vertical_align: Option<VerticalAlign>,
    pub rotation: Option<Rotation>,
    pub borders: Option<CellBorders>,
}

impl CellStyle {
    /// 把完整格式变成一层完整覆盖，供旧的 set_format API 使用。
    pub fn from_format(format: CellFormat) -> Self {
        Self {
            number_format: Some(format.number_format),
            bold: Some(format.bold),
            italic: Some(format.italic),
            align: Some(format.align),
            font_size: Some(format.font_size),
            color: Some(format.color),
            background: Some(format.background),
            font_family: Some(format.font_family),
            underline: Some(format.underline),
            strikethrough: Some(format.strikethrough),
            wrap_text: Some(format.wrap_text),
            indent: Some(format.indent),
            vertical_align: Some(format.vertical_align),
            rotation: Some(format.rotation),
            borders: Some(format.borders),
        }
    }

    pub fn is_empty(&self) -> bool {
        self == &Self::default()
    }

    /// 当前层和 patch 是否接管了至少一个相同属性。
    pub fn overlaps(&self, patch: &Self) -> bool {
        (self.number_format.is_some() && patch.number_format.is_some())
            || (self.bold.is_some() && patch.bold.is_some())
            || (self.italic.is_some() && patch.italic.is_some())
            || (self.align.is_some() && patch.align.is_some())
            || (self.font_size.is_some() && patch.font_size.is_some())
            || (self.color.is_some() && patch.color.is_some())
            || (self.background.is_some() && patch.background.is_some())
            || (self.font_family.is_some() && patch.font_family.is_some())
            || (self.underline.is_some() && patch.underline.is_some())
            || (self.strikethrough.is_some() && patch.strikethrough.is_some())
            || (self.wrap_text.is_some() && patch.wrap_text.is_some())
            || (self.indent.is_some() && patch.indent.is_some())
            || (self.vertical_align.is_some() && patch.vertical_align.is_some())
            || (self.rotation.is_some() && patch.rotation.is_some())
            || (self.borders.is_some() && patch.borders.is_some())
    }

    /// 只覆盖 patch 明确携带的属性。
    pub fn apply_patch(&mut self, patch: &Self) {
        if patch.number_format.is_some() {
            self.number_format.clone_from(&patch.number_format);
        }
        if patch.bold.is_some() {
            self.bold = patch.bold;
        }
        if patch.italic.is_some() {
            self.italic = patch.italic;
        }
        if patch.align.is_some() {
            self.align = patch.align;
        }
        if patch.font_size.is_some() {
            self.font_size = patch.font_size;
        }
        if patch.color.is_some() {
            self.color.clone_from(&patch.color);
        }
        if patch.background.is_some() {
            self.background.clone_from(&patch.background);
        }
        if patch.font_family.is_some() {
            self.font_family.clone_from(&patch.font_family);
        }
        if patch.underline.is_some() {
            self.underline = patch.underline;
        }
        if patch.strikethrough.is_some() {
            self.strikethrough = patch.strikethrough;
        }
        if patch.wrap_text.is_some() {
            self.wrap_text = patch.wrap_text;
        }
        if patch.indent.is_some() {
            self.indent = patch.indent;
        }
        if patch.vertical_align.is_some() {
            self.vertical_align = patch.vertical_align;
        }
        if patch.rotation.is_some() {
            self.rotation = patch.rotation;
        }
        if patch.borders.is_some() {
            self.borders.clone_from(&patch.borders);
        }
    }

    /// 把这一层明确接管的属性合并进最终显示格式。
    pub fn apply_to(&self, format: &mut CellFormat) {
        if let Some(value) = &self.number_format {
            format.number_format = value.clone();
        }
        if let Some(value) = self.bold {
            format.bold = value;
        }
        if let Some(value) = self.italic {
            format.italic = value;
        }
        if let Some(value) = self.align {
            format.align = value;
        }
        if let Some(value) = self.font_size {
            format.font_size = value;
        }
        if let Some(value) = &self.color {
            format.color.clone_from(value);
        }
        if let Some(value) = &self.background {
            format.background.clone_from(value);
        }
        if let Some(value) = &self.font_family {
            format.font_family.clone_from(value);
        }
        if let Some(value) = self.underline {
            format.underline = value;
        }
        if let Some(value) = self.strikethrough {
            format.strikethrough = value;
        }
        if let Some(value) = self.wrap_text {
            format.wrap_text = value;
        }
        if let Some(value) = self.indent {
            format.indent = value;
        }
        if let Some(value) = self.vertical_align {
            format.vertical_align = value;
        }
        if let Some(value) = self.rotation {
            format.rotation = value;
        }
        if let Some(value) = &self.borders {
            format.borders = value.clone();
        }
    }
}

/// 用户这次格式操作写到哪一种持久层。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum StyleScope {
    #[default]
    Cell,
    Row,
    Column,
}
