//! 单张工作表上"挂着"的功能：超链接、备注与线程批注、保护、大纲、数据验证、条件格式、Table。
//! 单元格、样式、尺寸由 `worksheet` 的流式解析负责；这里在去掉 `sheetData` 的小树上读其余部分。

use std::collections::HashSet;

use serde_json::Value;

use super::archive::Archive;
use super::drawings::{self, RawChart};
use super::worksheet::SheetData;
use super::{
    conditional, dom, dxf, hyperlinks, notes, outline, protection, rels, tables,
    threaded_comments, validation,
};
use crate::native::{
    CommentThread, ConditionalEntry, Hyperlink, Note, SheetOutline, SheetProtection, Table,
    ValidationRegion,
};
use crate::report::ReportBuilder;

#[derive(Default)]
pub struct SheetFeatures {
    pub tab_color: Option<String>,
    pub hyperlinks: Vec<Hyperlink>,
    pub hyperlink_displays: Vec<(u32, u32, String)>,
    pub notes: Vec<Note>,
    pub comments: Vec<CommentThread>,
    pub protection: Option<SheetProtection>,
    pub outline: Option<SheetOutline>,
    pub validations: Vec<ValidationRegion>,
    pub conditional: Vec<ConditionalEntry>,
    pub tables: Vec<Table>,
    /// 已转换的图表；锚点要等行高列宽读完才能换成像素。
    pub charts: Vec<RawChart>,
    pub pictures: Vec<super::pictures::RawPicture>,
    /// 迷你图组：id 待分配，数据表名仍是 XLSX 原始名。
    pub sparklines: Vec<crate::native_drawings::NativeDrawing>,
}

/// 各工作表共用的解析上下文。
pub struct Shared<'a> {
    pub dxfs: &'a [Option<Value>],
    pub theme: &'a [String],
    pub xf_locks: &'a [protection::XfLock],
    pub persons: &'a [(String, String)],
    pub raw_sheets: &'a [String],
    pub final_sheets: &'a [String],
    pub date1904: bool,
}

#[allow(clippy::too_many_arguments)]
pub fn read_sheet(
    archive: &mut Archive,
    part: &str,
    xml: &str,
    data: &mut SheetData,
    index: usize,
    sheet_name: &str,
    raw_name: &str,
    shared: &Shared,
    report: &mut ReportBuilder,
) -> SheetFeatures {
    let Some(extras) = dom::parse(xml, &["sheetData"]) else {
        let (outline, outline_losses) = outline::extract(data, None);
        report.add("outline", outline_losses);
        return SheetFeatures { outline, ..Default::default() };
    };
    let rels_xml = archive.read(&rels::rels_path(part)).ok().flatten().unwrap_or_default();
    let relationships = rels::parse(&rels_xml, rels::dir_of(part));

    let tab_color = extras
        .child("sheetPr")
        .and_then(|pr| pr.child("tabColor"))
        .and_then(|c| dxf::color_of(c, shared.theme))
        .map(|c| c.to_ascii_uppercase());

    let parsed_links = hyperlinks::parse(
        &extras,
        &relationships,
        index,
        shared.raw_sheets,
        shared.final_sheets,
    );
    let (validations, skipped_validations) = validation::parse(&extras, shared.date1904);
    let (conditional, skipped_conditional) = conditional::parse(&extras, shared.dxfs, shared.theme);
    let (protection, protection_losses) = protection::parse(&extras, data, shared.xf_locks);
    let (outline, outline_losses) = outline::extract(data, Some(&extras));

    report.add("hyperlinks", parsed_links.skipped);
    report.add("dataValidations", skipped_validations);
    report.add("conditionalFormats", skipped_conditional);
    report.add("sheetProtection", protection_losses);
    report.add("outline", outline_losses);

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

    let (sparklines, skipped_sparklines) = super::sparklines::parse(&extras, raw_name);
    report.add("sparklines", skipped_sparklines);
    let objects = drawings::read_sheet(
        archive,
        &relationships,
        raw_name,
        extras.each("drawing").next().is_some(),
    );
    report.add("charts", objects.skipped_charts);
    report.add("drawings", objects.others);

    let pivots = relationships
        .iter()
        .filter(|rel| !rel.external && rel.kind.ends_with("/pivotTable"))
        .count();
    report.add("pivotTables", pivots);

    let mut seen_comment_cells = HashSet::new();
    let mut comments = Vec::new();
    let mut missing_threaded = 0usize;
    let mut has_threaded_part = false;
    for rel in relationships
        .iter()
        .filter(|rel| !rel.external && rel.kind.ends_with("/threadedComment"))
    {
        if let Ok(Some(text)) = archive.read(&rel.target) {
            has_threaded_part = true;
            comments.extend(threaded_comments::parse_sheet(
                &text,
                shared.persons,
                index,
                &mut seen_comment_cells,
            ));
        } else {
            missing_threaded += 1;
        }
    }

    let mut features = SheetFeatures {
        tab_color,
        hyperlinks: parsed_links.links,
        hyperlink_displays: parsed_links.display_fallbacks,
        comments,
        protection,
        outline,
        validations,
        conditional,
        charts: objects.charts,
        pictures: objects.pictures,
        sparklines,
        ..Default::default()
    };
    if let Some(legacy) = relationships
        .iter()
        .find(|rel| !rel.external && rel.kind.ends_with("/comments"))
    {
        if let Ok(Some(text)) = archive.read(&legacy.target) {
            let (notes, placeholders) = notes::parse(&text, index);
            features.notes = notes;
            if !has_threaded_part && missing_threaded == 0 {
                missing_threaded = placeholders;
            }
        }
    }
    report.add("threadedComments", missing_threaded);

    if let Some(parts) = extras.child("tableParts") {
        for id in parts.each("tablePart").filter_map(|p| p.attr("id")) {
            let Some(rel) = relationships.iter().find(|rel| rel.id == id && !rel.external) else {
                report.add("tables", 1);
                continue;
            };
            if let Ok(Some(text)) = archive.read(&rel.target) {
                let (table, dropped, filter_dropped) = tables::parse(&text, sheet_name, index);
                report.add("tables", dropped);
                report.add("autoFilter", usize::from(filter_dropped));
                features.tables.extend(table);
            } else {
                report.add("tables", 1);
            }
        }
    }
    features
}
