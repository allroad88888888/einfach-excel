//! 原生数据区域 → chartEx 的数据块（每个 `cx:data` 一个 `ExSeries`）。
//! 数据约定与插件一致：瀑布 / 漏斗取第一个系列（有类别列时一并写出），直方图取第一个系列的原始数值，
//! 箱线图每个系列一个箱（类别列不参与，Excel 里类别会把一个系列拆成多个箱），
//! 树状 / 旭日图前面的列是层级类别、最后一列是数值。

use crate::write::cell_values::{as_number, as_text, Cells};
use crate::chart_payload::ChartPayload;
use crate::native::CellValue;
use crate::native_drawings::NativeRange;
use crate::write::charts::formula::{formula, Piece};
use crate::write::charts::series::{split, SeriesRefs};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind { Waterfall, Funnel, Histogram, Boxplot, Treemap, Sunburst }

impl Kind {
    pub fn of(chart_type: &str) -> Option<Kind> {
        Some(match chart_type {
            "waterfall" => Kind::Waterfall,
            "funnel" => Kind::Funnel,
            "histogram" => Kind::Histogram,
            "boxplot" => Kind::Boxplot,
            "treemap" => Kind::Treemap,
            "sunburst" => Kind::Sunburst,
            _ => return None,
        })
    }

    pub fn hierarchical(self) -> bool { matches!(self, Kind::Treemap | Kind::Sunburst) }
}

pub struct Dim {
    /// `strDim` 或 `numDim`。
    pub tag: &'static str,
    /// `cat` / `val` / `size`。
    pub kind: &'static str,
    pub formula: String,
    /// 缓存值，每层一个向量（层级类别时最内层在前）；空表示不写缓存。
    pub levels: Vec<Vec<Option<String>>>,
}

pub struct ExSeries {
    /// 系列名格的公式与缓存文本。
    pub name: Option<(String, String)>,
    pub dims: Vec<Dim>,
}

impl ExSeries {
    /// 第一维 `cat` 的缓存类别名（瀑布图汇总柱用）。
    pub fn category_names(&self) -> Vec<Option<String>> {
        self.dims.iter().find(|dim| dim.kind == "cat").and_then(|dim| dim.levels.first().cloned()).unwrap_or_default()
    }
}

fn levels(cells: &Cells, formula: &str, numeric: bool) -> Vec<Vec<Option<String>>> {
    let convert = |value: &Option<CellValue>| value.as_ref().and_then(if numeric { as_number } else { as_text });
    cells.values(formula).map(|values| vec![values.iter().map(convert).collect()]).unwrap_or_default()
}

fn dim(cells: &Cells, kind: &'static str, formula: String) -> Dim {
    let numeric = kind != "cat";
    Dim { tag: if numeric { "numDim" } else { "strDim" }, kind, levels: levels(cells, &formula, numeric), formula }
}

fn name_of(cells: &Cells, formula: Option<String>) -> Option<(String, String)> {
    let formula = formula?;
    let text = cells.values(&formula).and_then(|values| values.into_iter().next().flatten()).and_then(|v| as_text(&v));
    Some((formula, text.unwrap_or_default()))
}

pub fn build(kind: Kind, cells: &Cells, p: &ChartPayload, refs: &[Option<NativeRange>], own_sheet: &str) -> Option<Vec<ExSeries>> {
    let blocks: Vec<Piece> = refs.iter().map(|range| range.as_ref().map(|r| Piece {
        sheet: r.sheet_name.clone().unwrap_or_else(|| own_sheet.to_string()),
        start_row: r.start_row.min(r.end_row), end_row: r.start_row.max(r.end_row),
        start_col: r.start_col.min(r.end_col), end_col: r.start_col.max(r.end_col),
    })).collect::<Option<_>>()?;
    if kind.hierarchical() { return hierarchy(kind, cells, p, &blocks); }
    let all = split(&blocks, p.series_in == "rows", p.header_row, p.header_col)?;
    let wanted = if kind == Kind::Boxplot { all.len() } else { 1 };
    let built: Vec<ExSeries> = all.into_iter().take(wanted).map(|s| flat_series(kind, cells, s)).collect();
    (!built.is_empty()).then_some(built)
}

fn flat_series(kind: Kind, cells: &Cells, s: SeriesRefs) -> ExSeries {
    let mut dims = Vec::new();
    if let (Some(cat), Kind::Waterfall | Kind::Funnel) = (s.cat, kind) {
        dims.push(dim(cells, "cat", cat));
    }
    dims.push(dim(cells, "val", s.val));
    ExSeries { name: name_of(cells, s.name), dims }
}

/// 一块区域、按列排：最后一列是数值，前面所有列是层级（外层在左）。
fn hierarchy(_kind: Kind, cells: &Cells, p: &ChartPayload, blocks: &[Piece]) -> Option<Vec<ExSeries>> {
    let [block] = blocks else { return None };
    let first_row = block.start_row + u32::from(p.header_row);
    if p.series_in == "rows" || first_row > block.end_row || block.end_col <= block.start_col { return None; }
    let piece = |c0: u32, c1: u32, r0: u32, r1: u32| Piece { sheet: block.sheet.clone(), start_row: r0, end_row: r1, start_col: c0, end_col: c1 };
    let value_col = block.end_col;
    let cat_formula = formula(&[piece(block.start_col, value_col - 1, first_row, block.end_row)])?;
    let value_formula = formula(&[piece(value_col, value_col, first_row, block.end_row)])?;
    let mut cat = Dim { tag: "strDim", kind: "cat", levels: Vec::new(), formula: cat_formula };
    // 多层级缓存：最内层（最右一列）在前。
    for col in (block.start_col..value_col).rev() {
        let column = formula(&[piece(col, col, first_row, block.end_row)])?;
        cat.levels.extend(levels(cells, &column, false));
    }
    let name = p.header_row.then(|| formula(&[piece(value_col, value_col, block.start_row, block.start_row)])).flatten();
    Some(vec![ExSeries { name: name_of(cells, name), dims: vec![cat, dim(cells, "size", value_formula)] }])
}
