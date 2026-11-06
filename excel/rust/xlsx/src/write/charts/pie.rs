//! 饼图 / 圆环：只取第一个系列，没有坐标轴。

use super::elements::data_labels;
use super::series::SeriesRefs;
use super::series_xml::{ser, SerKind};
use crate::chart_payload::ChartPayload;

pub fn plot(p: &ChartPayload, series: &[SeriesRefs]) -> String {
    let sers: Vec<String> = series.first().map(|first| ser(SerKind::Pie, 0, first, p)).into_iter().collect();
    let sers = sers.concat();
    let labels = data_labels(p);
    if p.chart_type == "doughnut" {
        format!(r#"<c:doughnutChart><c:varyColors val="1"/>{sers}{labels}<c:firstSliceAng val="0"/><c:holeSize val="50"/></c:doughnutChart>"#)
    } else {
        format!(r#"<c:pieChart><c:varyColors val="1"/>{sers}{labels}<c:firstSliceAng val="0"/></c:pieChart>"#)
    }
}
