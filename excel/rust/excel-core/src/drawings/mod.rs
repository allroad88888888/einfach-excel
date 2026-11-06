//! 浮动对象目录：锚定在单元格上的通用对象，核心只负责位置、数据引用与历史，不认识图表等具体类型。
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::{CellAddress, CellRange, Sheet};
use serde::{Deserialize, Serialize};

mod shift;

pub const MAX_DRAWINGS_PER_SHEET: usize = 1000;
pub const MAX_DRAWING_REFS: usize = 64;
pub const MAX_DRAWING_PAYLOAD_BYTES: usize = 64 * 1024;
pub const MAX_DRAWING_SIZE_PX: u32 = 10_000;
const MAX_ID_CHARS: usize = 64;
const MAX_KIND_CHARS: usize = 32;

/// 左上角挂在单元格上，偏移与尺寸是 100% 缩放下的 CSS 像素；插删行列时随锚点格移动，不改尺寸。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingAnchor {
    pub row: u32,
    pub col: u32,
    #[serde(default)]
    pub offset_x: u32,
    #[serde(default)]
    pub offset_y: u32,
    pub width: u32,
    pub height: u32,
}

/// 对象读取的同表区域；结构编辑删光时变成 `None`（等同 #REF!），保持下标与载荷里的序号对应。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingRange {
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
}

impl DrawingRange {
    pub fn to_range(self) -> CellRange {
        CellRange::new(
            CellAddress::new(self.start_row, self.start_col),
            CellAddress::new(self.end_row, self.end_col),
        )
    }

    pub fn from_range(range: CellRange) -> Self {
        Self {
            start_row: range.start.row,
            start_col: range.start.col,
            end_row: range.end.row,
            end_col: range.end.col,
        }
    }
}

/// `kind` 与 `payload` 由插件定义，核心只校验形状与大小。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetDrawing {
    pub id: String,
    pub kind: String,
    pub anchor: DrawingAnchor,
    #[serde(default)]
    pub refs: Vec<Option<DrawingRange>>,
    #[serde(default = "empty_payload")]
    pub payload: serde_json::Value,
}

fn empty_payload() -> serde_json::Value {
    serde_json::Value::Object(Default::default())
}

fn valid_token(text: &str, max: usize, allow: impl Fn(char) -> bool) -> bool {
    !text.is_empty() && text.chars().count() <= max && text.chars().all(allow)
}

/// 用户提交与文件恢复共用的唯一校验。
pub fn validate_drawing(drawing: &SheetDrawing) -> Result<(), &'static str> {
    if !valid_token(&drawing.id, MAX_ID_CHARS, |c| {
        c.is_ascii_alphanumeric() || c == '-' || c == '_'
    }) {
        return Err("Object id must be 1-64 letters, digits, '-' or '_'.");
    }
    if !valid_token(&drawing.kind, MAX_KIND_CHARS, |c| {
        c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'
    }) {
        return Err("Object kind must be 1-32 lowercase letters, digits or '-'.");
    }
    let anchor = drawing.anchor;
    if anchor.row >= EXCEL_MAX_ROWS || anchor.col >= EXCEL_MAX_COLS {
        return Err("The object anchor is outside the worksheet.");
    }
    if !(1..=MAX_DRAWING_SIZE_PX).contains(&anchor.width)
        || !(1..=MAX_DRAWING_SIZE_PX).contains(&anchor.height)
        || anchor.offset_x > MAX_DRAWING_SIZE_PX
        || anchor.offset_y > MAX_DRAWING_SIZE_PX
    {
        return Err("Object size and offset must be between 1 and 10000 pixels.");
    }
    if drawing.refs.len() > MAX_DRAWING_REFS {
        return Err("An object can reference at most 64 ranges.");
    }
    for range in drawing.refs.iter().flatten() {
        if range.start_row > range.end_row
            || range.start_col > range.end_col
            || range.end_row >= EXCEL_MAX_ROWS
            || range.end_col >= EXCEL_MAX_COLS
        {
            return Err("An object range is outside the worksheet.");
        }
    }
    if !drawing.payload.is_object() {
        return Err("Object settings must be a JSON object.");
    }
    if drawing.payload.to_string().len() > MAX_DRAWING_PAYLOAD_BYTES {
        return Err("Object settings cannot exceed 64 KiB.");
    }
    Ok(())
}

impl Sheet {
    /// 按绘制顺序（后面的盖住前面的）返回。
    pub fn drawings(&self) -> &[SheetDrawing] {
        &self.drawings
    }

    pub fn drawing(&self, id: &str) -> Option<&SheetDrawing> {
        self.drawings.iter().find(|drawing| drawing.id == id)
    }

    /// 新 id 追加到最上层，已有 id 原位替换；返回是否真的改变。
    pub fn set_drawing(&mut self, drawing: SheetDrawing) -> Result<bool, &'static str> {
        validate_drawing(&drawing)?;
        let full = self.drawings.len() >= MAX_DRAWINGS_PER_SHEET;
        match self.drawings.iter_mut().find(|entry| entry.id == drawing.id) {
            Some(entry) if *entry == drawing => Ok(false),
            Some(entry) => {
                *entry = drawing;
                Ok(true)
            }
            None if full => Err("A worksheet can hold at most 1000 objects."),
            None => {
                self.drawings.push(drawing);
                Ok(true)
            }
        }
    }

    pub fn remove_drawing(&mut self, id: &str) -> bool {
        let before = self.drawings.len();
        self.drawings.retain(|drawing| drawing.id != id);
        self.drawings.len() != before
    }

    /// 移到最上层（目录末尾）或最下层（目录开头）；已在该位置或不存在时返回 false。
    pub fn reorder_drawing(&mut self, id: &str, to_front: bool) -> bool {
        let Some(index) = self.drawings.iter().position(|drawing| drawing.id == id) else {
            return false;
        };
        let last = self.drawings.len() - 1;
        if (to_front && index == last) || (!to_front && index == 0) {
            return false;
        }
        let drawing = self.drawings.remove(index);
        if to_front {
            self.drawings.push(drawing);
        } else {
            self.drawings.insert(0, drawing);
        }
        true
    }

    /// 文件恢复：整份校验通过才替换，重复 id 拒绝。
    pub fn replace_drawings(&mut self, drawings: Vec<SheetDrawing>) -> Result<(), &'static str> {
        if drawings.len() > MAX_DRAWINGS_PER_SHEET {
            return Err("A worksheet can hold at most 1000 objects.");
        }
        let mut ids = std::collections::HashSet::new();
        for drawing in &drawings {
            validate_drawing(drawing)?;
            if !ids.insert(drawing.id.as_str()) {
                return Err("Object ids must be unique within a worksheet.");
            }
        }
        self.drawings = drawings;
        Ok(())
    }
}
