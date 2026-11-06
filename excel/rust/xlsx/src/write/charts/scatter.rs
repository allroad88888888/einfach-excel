//! 散点图：类别列是 X（`c:xVal`），系列是 Y（`c:yVal`）；两个数值轴。

use super::axes::{val_axis, ValAxis};
use super::elements::data_labels;
use super::series::SeriesRefs;
use super::series_xml::{ser, SerKind};
use crate::chart_payload::ChartPayload;

const X_AXIS: u32 = 1001;
const Y_AXIS: u32 = 1002;

pub fn plot(p: &ChartPayload, series: &[SeriesRefs]) -> String {
    let sers: String = series.iter().enumerate().map(|(index, refs)| ser(SerKind::Scatter, index, refs, p)).collect();
    let mut xml = format!(r#"<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>{sers}{}<c:axId val="{X_AXIS}"/><c:axId val="{Y_AXIS}"/></c:scatterChart>"#, data_labels(p));
    xml.push_str(&val_axis(&ValAxis { id: X_AXIS, cross: Y_AXIS, pos: "b", title: &p.x_title,
        min: None, max: None, gridlines: false, crosses_max: false, between_mid: true }));
    xml.push_str(&val_axis(&ValAxis { id: Y_AXIS, cross: X_AXIS, pos: "l", title: &p.y_title,
        min: p.y_min, max: p.y_max, gridlines: p.gridlines, crosses_max: false, between_mid: true }));
    xml
}
