//! XLSX 图表导入：标题/图例/坐标轴等元素、组合图、颜色，以及被跳过图表和部分转换的报告。

mod chart_import_support;

use chart_import_support::{import, refs};
use serde_json::json;

const FIXTURE: &str = "tests/fixtures/charts.xlsx";
const MAIN: usize = 0;
const SHAPES: usize = 2;

#[test]
fn title_legend_axes_labels_and_options_are_read() {
    let book = import(FIXTURE);
    let payload = &book.chart(MAIN, "sales_col")["payload"];
    assert_eq!(payload["title"], "Region sales");
    assert_eq!(payload["legend"], "bottom");
    assert_eq!((payload["xTitle"].as_str(), payload["yTitle"].as_str()), (Some("Region"), Some("Units")));
    assert_eq!((payload["yMin"].as_f64(), payload["yMax"].as_f64()), (Some(0.0), Some(100.0)));
    assert_eq!(payload["gridlines"], false);
    assert_eq!(payload["dataLabels"], true);
    assert_eq!(payload["emptyCells"], "connect");
    assert_eq!(payload["showHidden"], true);
    assert_eq!(payload["fontSize"], 14);
    assert_eq!(payload["colors"], json!(["#FF0000", "#0000FF"]));
}

#[test]
fn missing_elements_fall_back_to_the_plugin_defaults() {
    let book = import(FIXTURE);
    let payload = &book.chart(MAIN, "chart-1")["payload"];
    assert_eq!(payload["title"], "");
    assert_eq!(payload["legend"], "right");
    assert_eq!((payload["xTitle"].as_str(), payload["yTitle"].as_str()), (Some(""), Some("")));
    assert_eq!((payload["yMin"].is_null(), payload["yMax"].is_null()), (true, true));
    assert_eq!(payload["gridlines"], true);
    assert_eq!(payload["dataLabels"], false);
    assert_eq!(payload["emptyCells"], "gap");
    assert_eq!(payload["showHidden"], false);
    assert!(payload["fontSize"].is_null());
    assert_eq!(payload["colors"], json!([]));
    // 删掉图例 → none。
    assert_eq!(book.chart(MAIN, "chart-5")["payload"]["legend"], "none");
}

#[test]
fn pie_colors_are_per_category() {
    let book = import(FIXTURE);
    assert_eq!(book.chart(SHAPES, "chart-8")["payload"]["colors"], json!(["#FF9900", null, "#00AA00"]));
}

#[test]
fn bar_plus_line_on_a_secondary_axis_is_a_combo() {
    let book = import(FIXTURE);
    let combo = book.chart(SHAPES, "chart-11");
    assert_eq!(combo["payload"]["type"], "combo");
    assert_eq!(combo["payload"]["stack"], "none");
    assert_eq!(combo["payload"]["combo"], json!([
        {"kind": "column", "secondary": false},
        {"kind": "line", "secondary": true},
    ]));
    assert_eq!(refs(combo), [(0, 0, 4, 2, None)]);
}

#[test]
fn a_literal_series_name_is_dropped_and_reported_but_the_chart_stays() {
    let book = import(FIXTURE);
    let chart = book.chart(SHAPES, "chart-12");
    assert_eq!(chart["payload"]["headerRow"], false);
    assert_eq!(chart["payload"]["headerCol"], true);
    // 没有名字行：只剩数据行 + 类别列。
    assert_eq!(refs(chart), [(1, 0, 4, 1, None)]);
    assert!(book.report_items().contains(&("chartSeriesNames", 1)));
}

#[test]
fn literal_and_external_charts_are_skipped_and_counted_while_images_stay_drawings() {
    let book = import(FIXTURE);
    // 雷达图已能导入，Unsupported 表上只剩它一个对象。
    assert_eq!(book.drawings(3).len(), 1);
    // numLit 数据、[1]Sheet1 外部引用各计一张；Shapes 上的图片照旧计入「图片或绘图」。
    assert_eq!(book.report_items(), [("drawings", 1), ("charts", 2), ("chartSeriesNames", 1)]);
    assert_eq!(
        book.report.summary,
        "Opened Excel workbook. Skipped: images or drawings, charts, chart series names."
    );
}
