//! 工作表的 drawing 部件：逐个锚点分出图表（解析）、读不了的图表（计数）和其他对象（图片、形状，计数）。
//! 锚点先原样保留（EMU），放到哪一格要等工作表的行高列宽读完，见 `placement`。

use super::archive::Archive;
use super::charts::{self, tree, Parsed};
use super::chartex;
use super::dom::{self, Node};
use super::rels::{self, Relationship};
use crate::drawing_geometry::CellCorner;

#[derive(Debug, Clone, Copy)]
pub enum RawAnchor {
    Cells { from: CellCorner, to: CellCorner },
    OneCell { from: CellCorner, cx: u64, cy: u64 },
    Absolute { x: u64, y: u64, cx: u64, cy: u64 },
}

pub struct RawChart {
    /// `xdr:cNvPr` 的名字，用作对象 id（合法且不重复时）。
    pub name: Option<String>,
    pub anchor: RawAnchor,
    pub parsed: Parsed,
    /// chartEx 瀑布图的汇总下标与类别名对不上（图照画，记入报告）。
    pub subtotals_mismatch: bool,
}

#[derive(Default)]
pub struct SheetObjects {
    pub charts: Vec<RawChart>,
    /// 不支持的类型、字面量数据、外部引用。
    pub skipped_charts: usize,
    /// 图片、形状等。
    pub others: usize,
}

enum Kind<'a> {
    Chart(&'a Relationship),
    ChartEx(&'a Relationship),
    SkippedChart,
    Other,
}

/// `own_sheet`：工作表原始名；`has_drawing_element`：工作表 XML 里有 `<drawing>` 但没有可用关系时仍记一个对象。
pub fn read_sheet(
    archive: &mut Archive,
    relationships: &[Relationship],
    own_sheet: &str,
    has_drawing_element: bool,
) -> SheetObjects {
    let mut objects = SheetObjects::default();
    let drawing_rels: Vec<_> = relationships.iter().filter(|rel| !rel.external && rel.kind.ends_with("/drawing")).collect();
    if drawing_rels.is_empty() {
        objects.others = usize::from(has_drawing_element);
        return objects;
    }
    for rel in drawing_rels {
        let rels_xml = archive.read(&rels::rels_path(&rel.target)).ok().flatten().unwrap_or_default();
        let drawing_rels = rels::parse(&rels_xml, rels::dir_of(&rel.target));
        let root = archive.read(&rel.target).ok().flatten().and_then(|xml| dom::parse(&xml, &[]));
        match root {
            Some(root) => read_anchors(archive, &root, &drawing_rels, own_sheet, &mut objects),
            None => {
                // 部件读不出来：只能按关系粗算。
                let charts = drawing_rels.iter().filter(|r| r.kind.ends_with("/chart") || r.kind.ends_with("/chartEx")).count();
                objects.skipped_charts += charts;
                objects.others += usize::from(charts == 0);
            }
        }
    }
    objects
}

fn read_anchors(archive: &mut Archive, root: &Node, drawing_rels: &[Relationship], own_sheet: &str, objects: &mut SheetObjects) {
    for anchor in root.children.iter().filter(|n| matches!(n.name.as_str(), "twoCellAnchor" | "oneCellAnchor" | "absoluteAnchor")) {
        match classify(anchor, drawing_rels) {
            Kind::Other => objects.others += 1,
            Kind::SkippedChart => objects.skipped_charts += 1,
            Kind::Chart(rel) => {
                let chart = archive.read(&rel.target).ok().flatten()
                    .and_then(|xml| charts::parse(&xml, own_sheet))
                    .zip(raw_anchor(anchor));
                match chart {
                    Some((parsed, raw)) => objects.charts.push(RawChart { name: frame_name(anchor), anchor: raw, parsed, subtotals_mismatch: false }),
                    None => objects.skipped_charts += 1,
                }
            }
            Kind::ChartEx(rel) => {
                let chart = archive.read(&rel.target).ok().flatten()
                    .and_then(|xml| chartex::parse(&xml, own_sheet))
                    .zip(raw_anchor(anchor));
                match chart {
                    Some((ex, raw)) => objects.charts.push(RawChart { name: frame_name(anchor), anchor: raw, parsed: ex.parsed, subtotals_mismatch: ex.subtotals_mismatch }),
                    None => objects.skipped_charts += 1,
                }
            }
        }
    }
}

fn classify<'a>(anchor: &Node, drawing_rels: &'a [Relationship]) -> Kind<'a> {
    let Some(frame) = tree::first_descendant(anchor, "graphicFrame") else { return Kind::Other };
    let Some(chart) = tree::first_descendant(frame, "chart") else { return Kind::Other };
    let rel = chart.attr("id").and_then(|id| drawing_rels.iter().find(|rel| rel.id == id && !rel.external));
    match rel {
        Some(rel) if rel.kind.ends_with("/chart") => Kind::Chart(rel),
        Some(rel) if rel.kind.ends_with("/chartEx") => Kind::ChartEx(rel),
        _ => Kind::SkippedChart,
    }
}

fn frame_name(anchor: &Node) -> Option<String> {
    let frame = tree::first_descendant(anchor, "graphicFrame")?;
    tree::first_descendant(frame, "cNvPr")?.attr("name").map(str::to_string)
}

fn number(node: &Node, name: &str) -> Option<u64> {
    node.attr(name)?.trim().parse().ok()
}

fn corner(node: &Node) -> Option<CellCorner> {
    let value = |name: &str| node.child(name).and_then(|child| child.text.trim().parse::<u64>().ok());
    Some(CellCorner {
        col: u32::try_from(value("col")?).ok()?,
        col_off_emu: value("colOff").unwrap_or(0),
        row: u32::try_from(value("row")?).ok()?,
        row_off_emu: value("rowOff").unwrap_or(0),
    })
}

fn raw_anchor(anchor: &Node) -> Option<RawAnchor> {
    let ext = || anchor.child("ext").and_then(|ext| Some((number(ext, "cx")?, number(ext, "cy")?)));
    match anchor.name.as_str() {
        "twoCellAnchor" => Some(RawAnchor::Cells { from: corner(anchor.child("from")?)?, to: corner(anchor.child("to")?)? }),
        "oneCellAnchor" => {
            let (cx, cy) = ext()?;
            Some(RawAnchor::OneCell { from: corner(anchor.child("from")?)?, cx, cy })
        }
        "absoluteAnchor" => {
            let (cx, cy) = ext()?;
            let pos = anchor.child("pos")?;
            Some(RawAnchor::Absolute { x: number(pos, "x")?, y: number(pos, "y")?, cx, cy })
        }
        _ => None,
    }
}
