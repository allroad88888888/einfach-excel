//! 股价图（开盘-最高-最低-收盘）：四个系列只提供数据，画面由高低线和涨跌柱组成。
//! 涨用 `colors[0]`、跌用 `colors[1]`，缺省同插件的红绿。

use super::axes::{cat_axis, val_axis, CatAxis, ValAxis};
use super::elements::{color_at, solid};
use super::series::SeriesRefs;
use super::series_xml::{ser, SerKind};
use crate::chart_payload::ChartPayload;

const CAT_AXIS: u32 = 1001;
const VAL_AXIS: u32 = 1002;
pub const UP_COLOR: &str = "2E9E5B";
pub const DOWN_COLOR: &str = "D64545";

fn bar(tag: &str, color: &str) -> String {
    format!("<c:{tag}><c:spPr>{}</c:spPr></c:{tag}>", solid(color))
}

/// 调用方保证恰好 4 个系列。
pub fn plot(p: &ChartPayload, series: &[SeriesRefs]) -> String {
    let sers: String = series.iter().enumerate().map(|(index, refs)| ser(SerKind::Stock, index, refs, p)).collect();
    let up = color_at(p, 0).unwrap_or_else(|| UP_COLOR.into());
    let down = color_at(p, 1).unwrap_or_else(|| DOWN_COLOR.into());
    let mut xml = format!(
        r#"<c:stockChart>{sers}<c:hiLowLines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:ln></c:spPr></c:hiLowLines><c:upDownBars><c:gapWidth val="150"/>{}{}</c:upDownBars><c:axId val="{CAT_AXIS}"/><c:axId val="{VAL_AXIS}"/></c:stockChart>"#,
        bar("upBars", &up), bar("downBars", &down));
    xml.push_str(&cat_axis(&CatAxis { id: CAT_AXIS, cross: VAL_AXIS, pos: "b", title: &p.x_title, deleted: false }));
    xml.push_str(&val_axis(&ValAxis { id: VAL_AXIS, cross: CAT_AXIS, pos: "l", title: &p.y_title,
        min: p.y_min, max: p.y_max, gridlines: p.gridlines, crosses_max: false, between_mid: false }));
    xml
}
