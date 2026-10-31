//! 单张工作表上"挂着"的功能：超链接、批注、数据验证、条件格式、Table。
//! 单元格、样式、尺寸由 `worksheet` 的流式解析负责；这里在去掉 `sheetData` 的小树上读其余部分。

use serde_json::Value;

use super::archive::Archive;
use super::{conditional, dom, hyperlinks, notes, rels, tables, validation};
use crate::native::{ConditionalEntry, Hyperlink, Note, Table, ValidationRegion};

#[derive(Default)]
pub struct SheetFeatures {
    pub hyperlinks: Vec<Hyperlink>,
    pub notes: Vec<Note>,
    pub validations: Vec<ValidationRegion>,
    pub conditional: Vec<ConditionalEntry>,
    pub tables: Vec<Table>,
}

/// 各工作表共用的解析上下文。
pub struct Shared<'a> {
    pub dxfs: &'a [Option<Value>],
    pub theme: &'a [String],
}

pub fn read_sheet(
    archive: &mut Archive, part: &str, xml: &str, index: usize, sheet_name: &str, shared: &Shared,
) -> SheetFeatures {
    let Some(extras) = dom::parse(xml, &["sheetData"]) else { return SheetFeatures::default() };
    let rels_xml = archive.read(&rels::rels_path(part)).ok().flatten().unwrap_or_default();
    let relationships = rels::parse(&rels_xml, rels::dir_of(part));

    let mut features = SheetFeatures {
        hyperlinks: hyperlinks::parse(&extras, &relationships, index),
        validations: validation::parse(&extras),
        conditional: conditional::parse(&extras, shared.dxfs, shared.theme),
        ..Default::default()
    };
    if let Some(comments) = relationships.iter().find(|rel| !rel.external && rel.kind.ends_with("/comments")) {
        if let Ok(Some(text)) = archive.read(&comments.target) {
            features.notes = notes::parse(&text, index);
        }
    }
    if let Some(parts) = extras.child("tableParts") {
        for id in parts.each("tablePart").filter_map(|p| p.attr("id")) {
            let Some(rel) = relationships.iter().find(|rel| rel.id == id && !rel.external) else { continue };
            if let Ok(Some(text)) = archive.read(&rel.target) {
                features.tables.extend(tables::parse(&text, sheet_name, index));
            }
        }
    }
    features
}
