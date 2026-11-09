//! 读完所有工作表之后把解析好的图表和图片放进 `Persistence.drawings`：锚点换成像素（需要该表的行高列宽）、
//! 区域里的原始表名换成引擎表名、分配对象 id；图片字节按内容去重放进 `Persistence.media`。

use std::collections::HashSet;

use super::drawings::{RawAnchor, RawChart};
use super::pictures::RawPicture;
use crate::drawing_geometry::{emu_to_px, SheetGeometry};
use crate::native::Persistence;
use crate::native_drawings::{NativeAnchor, NativeDrawing, NativeRange, SheetDrawings, CHART_KIND};
use crate::native_media::{content_id, encode, sniff_image_type, NativeMedia, IMAGE_KIND};
use crate::report::ReportBuilder;

/// 一张表上待放置的对象。
pub struct SheetObjects {
    pub charts: Vec<RawChart>,
    pub pictures: Vec<RawPicture>,
    /// 已是原生形状，只差 id 与表名。
    pub sparklines: Vec<NativeDrawing>,
}

/// `raw_names[i]` 是第 i 张表在 XLSX 里的原始名（与 `workbook.sheets` 同序）。
/// 引用了不存在的表的图表被跳过并计入 `charts`。
pub fn place_all(
    workbook: &mut Persistence,
    pending: Vec<(usize, SheetObjects)>,
    raw_names: &[String],
    report: &mut ReportBuilder,
) {
    let native_names: Vec<String> = workbook.sheets.iter().map(|sheet| sheet.name.clone()).collect();
    let mut ids = IdAllocator::default();
    for (sheet, SheetObjects { charts, pictures, sparklines }) in pending {
        let geometry = SheetGeometry::from_native(workbook, sheet);
        let mut drawings = Vec::new();
        for chart in charts {
            let Some(refs) = chart.parsed.refs.into_iter()
                .map(|range| rename(range, raw_names, &native_names).map(Some))
                .collect::<Option<Vec<_>>>() else {
                report.add("charts", 1);
                continue;
            };
            if chart.parsed.names_dropped {
                report.add("chartSeriesNames", 1);
            }
            if chart.subtotals_mismatch {
                report.add("chartSubtotals", 1);
            }
            drawings.push(NativeDrawing {
                id: ids.allocate(chart.name.as_deref()),
                kind: CHART_KIND.into(),
                anchor: pixel_anchor(&geometry, &chart.anchor),
                refs,
                payload: chart.parsed.payload.to_value(),
                media: None,
            });
        }
        for picture in pictures {
            let id = content_id(&picture.bytes);
            if !workbook.media.iter().any(|media| media.id == id) {
                let mime = sniff_image_type(&picture.bytes).unwrap_or("image/png");
                workbook.media.push(NativeMedia { id: id.clone(), mime: mime.into(), data: encode(&picture.bytes) });
            }
            let payload = match picture.alt {
                Some(alt) => serde_json::json!({ "alt": alt }),
                None => serde_json::json!({}),
            };
            drawings.push(NativeDrawing {
                id: ids.allocate_as(picture.name.as_deref(), "image"),
                kind: IMAGE_KIND.into(),
                anchor: pixel_anchor(&geometry, &picture.anchor),
                refs: Vec::new(),
                payload,
                media: Some(id),
            });
        }
        for mut sparkline in sparklines {
            let Some(refs) = sparkline.refs.into_iter()
                .map(|range| range.and_then(|range| rename(range, raw_names, &native_names)).map(Some))
                .collect::<Option<Vec<_>>>() else {
                report.add("sparklines", 1);
                continue;
            };
            sparkline.refs = refs;
            sparkline.id = ids.allocate_as(None, "sparkline");
            drawings.push(sparkline);
        }
        if !drawings.is_empty() {
            workbook.drawings.push(SheetDrawings { sheet, drawings });
        }
    }
}

fn rename(mut range: NativeRange, raw_names: &[String], native_names: &[String]) -> Option<NativeRange> {
    if let Some(raw) = &range.sheet_name {
        let index = raw_names.iter().position(|name| name.eq_ignore_ascii_case(raw))?;
        range.sheet_name = Some(native_names.get(index)?.clone());
    }
    Some(range)
}

fn pixel_anchor(geometry: &SheetGeometry, anchor: &RawAnchor) -> NativeAnchor {
    match *anchor {
        RawAnchor::Cells { from, to } => geometry.from_corners(from, to),
        RawAnchor::OneCell { from, cx, cy } => NativeAnchor {
            row: from.row,
            col: from.col,
            offset_x: emu_to_px(from.col_off_emu),
            offset_y: emu_to_px(from.row_off_emu),
            width: emu_to_px(cx).max(1),
            height: emu_to_px(cy).max(1),
        },
        RawAnchor::Absolute { x, y, cx, cy } => {
            let (col, offset_x) = locate(emu_to_px(x), |col| geometry.col_px(col));
            let (row, offset_y) = locate(emu_to_px(y), |row| geometry.row_px(row));
            NativeAnchor { row, col, offset_x, offset_y, width: emu_to_px(cx).max(1), height: emu_to_px(cy).max(1) }
        }
    }
}

/// 从表左（上）边起 `distance` 像素落在哪一格、格内偏移多少。
fn locate(distance: u32, size: impl Fn(u32) -> u32) -> (u32, u32) {
    let mut left = distance;
    for index in 0..1_048_576u32 {
        let px = size(index);
        if left < px {
            return (index, left);
        }
        left -= px;
    }
    (1_048_575, 0)
}

/// 对象 id 在工作簿内唯一：沿用图形名（只允许字母数字 `-` `_` `.`、≤64 字符，且没用过），否则 `chart-N`。
#[derive(Default)]
struct IdAllocator {
    used: HashSet<String>,
    counter: usize,
}

impl IdAllocator {
    fn allocate(&mut self, name: Option<&str>) -> String {
        self.allocate_as(name, "chart")
    }

    fn allocate_as(&mut self, name: Option<&str>, prefix: &str) -> String {
        let valid = |id: &str| {
            !id.is_empty() && id.len() <= 64
                && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        };
        if let Some(name) = name.filter(|name| valid(name) && !self.used.contains(*name)) {
            self.used.insert(name.to_string());
            return name.to_string();
        }
        loop {
            self.counter += 1;
            let id = format!("{prefix}-{}", self.counter);
            if self.used.insert(id.clone()) {
                return id;
            }
        }
    }
}
