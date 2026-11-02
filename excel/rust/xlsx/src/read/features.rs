//! 单张工作表上"挂着"的功能：超链接、批注、数据验证、条件格式、Table。
//! 单元格、样式、尺寸由 `worksheet` 的流式解析负责；这里在去掉 `sheetData` 的小树上读其余部分。

use serde_json::Value;

use super::archive::Archive;
use super::{conditional, dom, hyperlinks, notes, rels, tables, validation};
use crate::native::{ConditionalEntry, Hyperlink, Note, Table, ValidationRegion};
use crate::report::ReportBuilder;

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
    pub date1904: bool,
}

pub fn read_sheet(
    archive: &mut Archive,
    part: &str,
    xml: &str,
    index: usize,
    sheet_name: &str,
    shared: &Shared,
    report: &mut ReportBuilder,
) -> SheetFeatures {
    let Some(extras) = dom::parse(xml, &["sheetData"]) else { return SheetFeatures::default() };
    let rels_xml = archive.read(&rels::rels_path(part)).ok().flatten().unwrap_or_default();
    let relationships = rels::parse(&rels_xml, rels::dir_of(part));

    let (hyperlinks, skipped_links) = hyperlinks::parse(&extras, &relationships, index);
    let (validations, skipped_validations) = validation::parse(&extras, shared.date1904);
    let (conditional, skipped_conditional) = conditional::parse(&extras, shared.dxfs, shared.theme);
    report.add("hyperlinks", skipped_links);
    report.add("dataValidations", skipped_validations);
    report.add("conditionalFormats", skipped_conditional);

    if extras.child("sheetProtection").is_some() || extras.child("protectedRanges").is_some() {
        report.add("sheetProtection", 1);
    }
    if extras.child("autoFilter").is_some() {
        report.add("autoFilter", 1);
    }
    if extras.child("pageSetup").is_some()
        || extras.child("printOptions").is_some()
        || extras.child("headerFooter").is_some()
        || extras.child("rowBreaks").is_some()
        || extras.child("colBreaks").is_some()
    {
        report.add("printSetup", 1);
    }

    let drawings = relationships.iter().filter(|rel| !rel.external && rel.kind.ends_with("/drawing")).count()
        .max(extras.each("drawing").count());
    let mut charts = 0usize;
    let mut images = 0usize;
    for rel in relationships.iter().filter(|rel| !rel.external && rel.kind.ends_with("/drawing")) {
        let drw_rels_xml = archive.read(&rels::rels_path(&rel.target)).ok().flatten().unwrap_or_default();
        let drw_rels = rels::parse(&drw_rels_xml, rels::dir_of(&rel.target));
        let c = drw_rels.iter().filter(|r| r.kind.ends_with("/chart") || r.kind.ends_with("/chartEx")).count();
        let img = drw_rels.iter().filter(|r| r.kind.ends_with("/image")).count();
        charts += c;
        if img > 0 {
            images += img;
        } else if c == 0 {
            images += 1;
        }
    }
    if drawings > 0 && charts == 0 && images == 0 {
        images = drawings;
    }
    report.add("charts", charts);
    report.add("drawings", images);

    let pivots = relationships.iter().filter(|rel| !rel.external && rel.kind.ends_with("/pivotTable")).count();
    report.add("pivotTables", pivots);

    let mut threaded = 0usize;
    for rel in relationships.iter().filter(|rel| !rel.external && rel.kind.ends_with("/threadedComment")) {
        if let Ok(Some(text)) = archive.read(&rel.target) {
            threaded += dom::parse(&text, &[])
                .map_or(1, |root| root.each("threadedComment").count().max(1));
        } else {
            threaded += 1;
        }
    }

    let mut features = SheetFeatures { hyperlinks, validations, conditional, ..Default::default() };
    if let Some(comments) = relationships.iter().find(|rel| !rel.external && rel.kind.ends_with("/comments")) {
        if let Ok(Some(text)) = archive.read(&comments.target) {
            let (notes, placeholders) = notes::parse(&text, index);
            features.notes = notes;
            if threaded == 0 {
                threaded = placeholders;
            }
        }
    }
    report.add("threadedComments", threaded);

    if let Some(parts) = extras.child("tableParts") {
        for id in parts.each("tablePart").filter_map(|p| p.attr("id")) {
            let Some(rel) = relationships.iter().find(|rel| rel.id == id && !rel.external) else {
                report.add("tables", 1);
                continue;
            };
            if let Ok(Some(text)) = archive.read(&rel.target) {
                let (table, dropped) = tables::parse(&text, sheet_name, index);
                report.add("tables", dropped);
                features.tables.extend(table);
            } else {
                report.add("tables", 1);
            }
        }
    }
    features
}
