//! 雷达图：类别是辐条，每个系列一圈折线（`radarStyle=marker`）；坐标轴同柱线图，数值轴带网格线。

use super::axes::{cat_axis, val_axis, CatAxis, ValAxis};
use super::elements::data_labels;
use super::series::SeriesRefs;
use super::series_xml::{ser, SerKind};
use crate::chart_payload::ChartPayload;

const CAT_AXIS: u32 = 1001;
const VAL_AXIS: u32 = 1002;

pub fn plot(p: &ChartPayload, series: &[SeriesRefs]) -> String {
    let sers: String = series.iter().enumerate().map(|(index, refs)| ser(SerKind::Radar, index, refs, p)).collect();
    let mut xml = format!(r#"<c:radarChart><c:radarStyle val="marker"/><c:varyColors val="0"/>{sers}{}<c:axId val="{CAT_AXIS}"/><c:axId val="{VAL_AXIS}"/></c:radarChart>"#, data_labels(p));
    xml.push_str(&cat_axis(&CatAxis { id: CAT_AXIS, cross: VAL_AXIS, pos: "b", title: "", deleted: false }));
    // 插件的雷达图刻度自动，不写 y_min / y_max。
    xml.push_str(&val_axis(&ValAxis { id: VAL_AXIS, cross: CAT_AXIS, pos: "l", title: "",
        min: None, max: None, gridlines: p.gridlines, crosses_max: false, between_mid: false }));
    xml
}
