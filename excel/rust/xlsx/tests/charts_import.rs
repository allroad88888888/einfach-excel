//! XLSX 图表导入：类型、系列方向、数据区域、锚点。样本由 tests/fixtures/make_chart_fixtures.py 生成
//! （行高 20px、列宽 96px 都是显式设置的）。元素与跳过报告见 charts_import_elements.rs。

mod chart_import_support;

use chart_import_support::{anchor, import, refs};

const FIXTURE: &str = "tests/fixtures/charts.xlsx";
const MAIN: usize = 0;
const SHAPES: usize = 2;

fn r(start_row: u64, start_col: u64, end_row: u64, end_col: u64, sheet: Option<&str>) -> (u64, u64, u64, u64, Option<String>) {
    (start_row, start_col, end_row, end_col, sheet.map(str::to_string))
}

#[test]
fn every_supported_chart_becomes_a_chart_object_on_its_own_sheet() {
    let book = import(FIXTURE);
    let ids = |sheet| book.drawings(sheet).iter().map(|d| d["id"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    // 图形名合法且不重复的沿用（sales_col）；含空格或重名的回落到工作簿内唯一的 chart-N。
    let main = ids(MAIN);
    assert!(main.contains(&"sales_col".to_string()), "{main:?}");
    assert_eq!(main.len(), 6);
    assert_eq!(main.iter().filter(|id| id.starts_with("chart-")).count(), 5);
    assert_eq!(ids(SHAPES).len(), 7);
    assert!(book.drawings(1).is_empty());
    // 雷达图现在可以导入；字面量数据和外部引用的图表仍然跳过。
    assert_eq!(ids(3).len(), 1);
    assert_eq!(book.drawings(3)[0]["payload"]["type"], "radar");
    let all: Vec<_> = (0..4).flat_map(ids).collect();
    let mut unique = all.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), all.len(), "ids are unique in the workbook: {all:?}");
    assert!(book.drawings(MAIN).iter().chain(&book.drawings(SHAPES)).all(|d| d["kind"] == "chart"));
}

#[test]
fn comments_on_the_same_sheet_survive_next_to_charts() {
    let book = import(FIXTURE);
    let notes = book.file["workbook"]["notes"].as_array().unwrap();
    assert!(notes.iter().any(|note| note["sheet"] == 0), "{notes:?}");
}

#[test]
fn clustered_column_with_two_cell_anchor_and_a_block_of_data() {
    let book = import(FIXTURE);
    let chart = book.chart(MAIN, "sales_col");
    assert_eq!(chart["payload"]["type"], "column");
    assert_eq!(chart["payload"]["stack"], "none");
    assert_eq!(chart["payload"]["seriesIn"], "columns");
    assert_eq!((chart["payload"]["headerRow"].as_bool(), chart["payload"]["headerCol"].as_bool()), (Some(true), Some(true)));
    assert_eq!(refs(chart), [r(0, 0, 4, 2, None)]);
    // F2 到 L17：6 列 x 96px，15 行 x 20px。
    assert_eq!(anchor(chart), (1, 5, 0, 0, 576, 300));
}

#[test]
fn stacked_column_with_one_cell_anchor_takes_its_size_from_ext() {
    let book = import(FIXTURE);
    let chart = book.chart(MAIN, "chart-1");
    assert_eq!((chart["payload"]["type"].as_str(), chart["payload"]["stack"].as_str()), (Some("column"), Some("stacked")));
    assert_eq!(refs(chart), [r(0, 0, 4, 3, None)]);
    // F20，12 x 6 cm = 4320000 x 2160000 EMU。
    assert_eq!(anchor(chart), (19, 5, 0, 0, 454, 227));
}

#[test]
fn percent_stacked_horizontal_bar_with_absolute_anchor_finds_its_start_cell() {
    let book = import(FIXTURE);
    let chart = book.chart(MAIN, "chart-5");
    assert_eq!(chart["payload"]["type"], "bar");
    assert_eq!(chart["payload"]["stack"], "percent");
    // x=970px 落在第 11 列（K，下标 10）偏移 10；y=430px 落在第 22 行偏移 10。
    assert_eq!(anchor(chart), (21, 10, 10, 10, 400, 240));
}

#[test]
fn series_in_rows_reads_names_from_the_first_column() {
    let book = import(FIXTURE);
    let chart = book.chart(MAIN, "chart-3");
    assert_eq!(chart["payload"]["type"], "line");
    assert_eq!(chart["payload"]["seriesIn"], "rows");
    assert_eq!((chart["payload"]["headerRow"].as_bool(), chart["payload"]["headerCol"].as_bool()), (Some(true), Some(true)));
    assert_eq!(refs(chart), [r(0, 0, 2, 3, None)]);
}

#[test]
fn cross_sheet_data_keeps_the_sheet_name() {
    let book = import(FIXTURE);
    let chart = book.chart(MAIN, "chart-2");
    assert_eq!(refs(chart), [r(0, 0, 4, 2, Some("Sales data"))]);
}

#[test]
fn series_that_are_not_adjacent_become_separate_blocks_with_adjacent_strips_merged() {
    let book = import(FIXTURE);
    let chart = book.chart(MAIN, "chart-4");
    let sheet = Some("Sales data");
    // 类别 A 与系列 B 紧挨合成 A:B，E 列单独一块。
    assert_eq!(refs(chart), [r(0, 0, 4, 1, sheet), r(0, 4, 4, 4, sheet)]);
    assert_eq!((chart["payload"]["headerRow"].as_bool(), chart["payload"]["headerCol"].as_bool()), (Some(true), Some(true)));
}

#[test]
fn line_area_pie_doughnut_and_scatter_types() {
    let book = import(FIXTURE);
    let kind = |id: &str| {
        let payload = &book.chart(SHAPES, id)["payload"];
        (payload["type"].as_str().unwrap().to_string(), payload["stack"].as_str().unwrap().to_string())
    };
    assert_eq!(kind("chart-6"), ("line".into(), "none".into()));
    assert_eq!(kind("chart-7"), ("area".into(), "percent".into()));
    assert_eq!(kind("chart-8"), ("pie".into(), "none".into()));
    assert_eq!(kind("chart-9"), ("doughnut".into(), "none".into()));
    assert_eq!(kind("chart-10"), ("scatter".into(), "none".into()));
    assert_eq!(refs(book.chart(SHAPES, "chart-6")), [r(0, 0, 4, 2, None)]);
    // 饼图：单系列 + 类别。
    assert_eq!(refs(book.chart(SHAPES, "chart-8")), [r(0, 0, 4, 1, None)]);
    // 圆环取的是 Cost 列：类别块 + 值块。
    assert_eq!(refs(book.chart(SHAPES, "chart-9")), [r(0, 0, 4, 0, None), r(0, 2, 4, 2, None)]);
    // 散点：X 在 'Sales data'!D，Y 在 C，X 在右侧所以各占一块，类别（X）块在前。
    let sheet = Some("Sales data");
    assert_eq!(refs(book.chart(SHAPES, "chart-10")), [r(0, 3, 4, 3, sheet), r(0, 2, 4, 2, sheet)]);
}
