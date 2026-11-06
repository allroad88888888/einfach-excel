//! `xl/charts/chartExN.xml` 的结构：系列用的 layoutId、它引用的 `cx:data` 里的维度公式与缓存。

use crate::read::charts::formula::{parse_formula, SheetRect};
use crate::read::dom::Node;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind { Waterfall, Funnel, Histogram, Boxplot, Treemap, Sunburst }

impl Kind {
    /// `None`：不支持的 chartEx 类型（地图、帕累托线等）。
    pub fn of(layout_id: &str) -> Option<Kind> {
        Some(match layout_id {
            "waterfall" => Kind::Waterfall,
            "funnel" => Kind::Funnel,
            "clusteredColumn" => Kind::Histogram,
            "boxWhisker" => Kind::Boxplot,
            "treemap" => Kind::Treemap,
            "sunburst" => Kind::Sunburst,
            _ => return None,
        })
    }

    pub fn payload_type(self) -> &'static str {
        match self {
            Kind::Waterfall => "waterfall",
            Kind::Funnel => "funnel",
            Kind::Histogram => "histogram",
            Kind::Boxplot => "boxplot",
            Kind::Treemap => "treemap",
            Kind::Sunburst => "sunburst",
        }
    }

    pub fn hierarchical(self) -> bool { matches!(self, Kind::Treemap | Kind::Sunburst) }
    pub fn has_axes(self) -> bool { matches!(self, Kind::Waterfall | Kind::Histogram | Kind::Boxplot) }
}

/// 一个系列的数据：公式（读不成引用时 `None`）与类别缓存。
pub struct SeriesData<'a> {
    pub node: &'a Node,
    pub tx: Option<SheetRect>,
    pub name_lost: bool,
    pub cat: Option<Vec<SheetRect>>,
    pub val: Vec<SheetRect>,
    /// 类别的缓存名（第一层，下标即点序号）。
    pub cat_names: Vec<Option<String>>,
}

fn formula(dim: &Node) -> Option<Vec<SheetRect>> {
    parse_formula(&dim.child("f")?.text)
}

/// 第一个 `lvl` 的缓存文本，按 `idx` 摆放。
fn names(dim: &Node) -> Vec<Option<String>> {
    let Some(level) = dim.child("lvl") else { return Vec::new() };
    let mut out = vec![None; level.attr_u32("ptCount").unwrap_or(0).min(100_000) as usize];
    for point in level.each("pt") {
        let Some(index) = point.attr_u32("idx").map(|i| i as usize).filter(|i| *i < out.len()) else { continue };
        out[index] = Some(point.text.clone());
    }
    out
}

/// 系列名格：单个单元格才保留，其余写法记为「名字丢了」。
fn series_name(series: &Node) -> (Option<SheetRect>, bool) {
    let Some(tx) = series.child("tx") else { return (None, false) };
    match tx.child("txData").and_then(|data| data.child("f")).and_then(|f| parse_formula(&f.text)) {
        Some(rects) if rects.len() == 1 && rects[0].width() == 1 && rects[0].height() == 1 => (Some(rects[0].clone()), false),
        _ => (None, true),
    }
}

/// 值维度读不成引用（只有缓存、外部工作簿）返回 `None`，整张图表跳过。
pub fn series_data<'a>(series: &'a Node, chart_data: &Node) -> Option<SeriesData<'a>> {
    let id = series.child("dataId")?.attr("val")?;
    let data = chart_data.each("data").find(|data| data.attr("id") == Some(id))?;
    let value = data.each("numDim").find(|dim| matches!(dim.attr("type"), Some("val" | "size")))?;
    let cat = data.each("strDim").find(|dim| dim.attr("type") == Some("cat"));
    let (tx, name_lost) = series_name(series);
    Some(SeriesData {
        node: series,
        tx,
        name_lost,
        cat: cat.and_then(formula),
        val: formula(value)?,
        cat_names: cat.map(names).unwrap_or_default(),
    })
}
