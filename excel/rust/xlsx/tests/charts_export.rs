//! 图表导出：包结构、锚点、报告。（系列公式与元素映射见 charts_export_series.rs / charts_export_elements.rs）

mod common;
use common::*;

fn sales() -> serde_json::Value {
    serde_json::json!([range(0, 0, 4, 2, Some("My Data"))])
}

#[test]
fn writes_drawing_chart_rels_content_types_and_anchor() {
    let json = native(vec![chart("sales", sales(), serde_json::json!({"type": "column", "title": "Sales"}))], serde_json::json!({}));
    let out = export(&json);
    assert!(out.report.items.is_empty(), "{:?}", out.report.items);

    let types = out.part("[Content_Types].xml");
    assert!(types.contains(r#"PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml""#));
    assert!(types.contains(r#"PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml""#));

    let sheet_rels = out.part("xl/worksheets/_rels/sheet1.xml.rels");
    assert!(sheet_rels.contains(r#"relationships/drawing" Target="../drawings/drawing1.xml""#), "{sheet_rels}");
    assert!(out.part("xl/worksheets/sheet1.xml").contains(r#"<drawing r:id="rId1"/>"#));
    assert!(!out.has_part("xl/worksheets/_rels/sheet2.xml.rels"));

    let drawing_rels = out.part("xl/drawings/_rels/drawing1.xml.rels");
    assert!(drawing_rels.contains(r#"relationships/chart" Target="../charts/chart1.xml""#), "{drawing_rels}");

    let drawing = out.part("xl/drawings/drawing1.xml");
    assert!(drawing.contains(r#"<xdr:twoCellAnchor editAs="oneCell">"#));
    // 默认行高 28、列宽 120：左上 D2 + (10, 5)；右下 = 偏移 (490, 293) → 向右 4 列、向下 10 行。
    assert!(drawing.contains("<xdr:from><xdr:col>3</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>47625</xdr:rowOff></xdr:from>"), "{drawing}");
    assert!(drawing.contains("<xdr:to><xdr:col>7</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>11</xdr:row><xdr:rowOff>123825</xdr:rowOff></xdr:to>"), "{drawing}");
    assert!(drawing.contains(r#"<xdr:cNvPr id="2" name="sales"/>"#));
    assert!(drawing.contains(r#"<c:chart r:id="rId1"/>"#));
}

#[test]
fn anchor_uses_custom_row_heights_and_column_widths() {
    let sizes = serde_json::json!({"sizes": [{"sheet": 0, "startRow": 0, "startCol": 0, "endRow": 10, "endCol": 10,
        "colWidths": [{"colIndex": 3, "widthPx": 200}], "rowHeights": [{"rowIndex": 1, "heightPx": 100}]}]});
    let json = native(vec![chart("c", sales(), serde_json::json!({}))], sizes);
    let drawing = export(&json).part("xl/drawings/drawing1.xml");
    // 横向：10 + 480 = 490 = 200（D）+ 120×2（E、F）+ 50 → G 格内 50px；纵向 5 + 288 = 293 = 100（第 2 行）+ 28×6 + 25。
    assert!(drawing.contains("<xdr:to><xdr:col>6</xdr:col><xdr:colOff>476250</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>238125</xdr:rowOff></xdr:to>"), "{drawing}");
}

#[test]
fn several_charts_and_sheets_get_consecutive_part_numbers() {
    let mut json: serde_json::Value = serde_json::from_str(&native(
        vec![chart("a", sales(), serde_json::json!({})), chart("b", sales(), serde_json::json!({"type": "line"}))],
        serde_json::json!({}))).unwrap();
    json["workbook"]["drawings"].as_array_mut().unwrap()
        .push(serde_json::json!({"sheet": 1, "drawings": [chart("c", serde_json::json!([range(0, 0, 4, 1, None)]), serde_json::json!({"type": "pie"}))]}));
    let out = export(&json.to_string());
    let first = out.part("xl/drawings/drawing1.xml");
    assert!(first.contains(r#"name="a""#) && first.contains(r#"name="b""#));
    assert!(first.contains(r#"<xdr:cNvPr id="3" name="b"/>"#));
    assert!(out.part("xl/drawings/drawing2.xml").contains(r#"name="c""#));
    assert!(out.part("xl/charts/chart3.xml").contains("<c:pieChart>"));
    // 工作表 2 自己的图表没有表名，用对象所在表。
    assert!(out.part("xl/charts/chart3.xml").contains("<c:f>'My Data'!$B$2:$B$5</c:f>"));
    assert!(out.part("xl/worksheets/_rels/sheet2.xml.rels").contains("drawing2.xml"));
}

#[test]
fn drawing_element_precedes_legacy_drawing_of_comments() {
    let json = native(vec![chart("a", sales(), serde_json::json!({}))],
        serde_json::json!({"notes": [{"sheet": 0, "row": 0, "col": 0, "text": "hi"}]}));
    let sheet = export(&json).part("xl/worksheets/sheet1.xml");
    let drawing = sheet.find("<drawing ").unwrap();
    let legacy = sheet.find("<legacyDrawing ").unwrap();
    assert!(drawing < legacy, "{sheet}");
    assert!(sheet.find("</sheetData>").unwrap() < drawing);
}

#[test]
fn unsupported_types_and_other_objects_are_reported_not_written() {
    let image = serde_json::json!({"id": "logo", "kind": "image", "anchor": anchor()});
    let json = native(vec![
        chart("ok", sales(), serde_json::json!({"type": "column"})),
        chart("bubble", sales(), serde_json::json!({"type": "bubble"})),
        chart("tree", sales(), serde_json::json!({"type": "wordcloud"})),
        chart("broken", serde_json::json!([null]), serde_json::json!({"type": "line"})),
        chart("lonely", serde_json::json!([range(0, 0, 0, 3, None)]), serde_json::json!({"type": "line"})),
        image,
    ], serde_json::json!({}));
    let out = export(&json);
    assert_eq!(out.report_kinds(), [("charts".to_string(), 4), ("drawings".to_string(), 1)]);
    let drawing = out.part("xl/drawings/drawing1.xml");
    assert_eq!(drawing.matches("<xdr:twoCellAnchor").count(), 1);
    assert!(!out.has_part("xl/charts/chart2.xml"));
}

#[test]
fn sheet_with_only_unsupported_objects_gets_no_drawing_part() {
    let json = native(vec![chart("bubble", sales(), serde_json::json!({"type": "bubble"}))], serde_json::json!({}));
    let out = export(&json);
    assert!(!out.has_part("xl/drawings/drawing1.xml"));
    assert!(!out.part("xl/worksheets/sheet1.xml").contains("<drawing"));
    assert_eq!(out.report_kinds(), [("charts".to_string(), 1)]);
}
