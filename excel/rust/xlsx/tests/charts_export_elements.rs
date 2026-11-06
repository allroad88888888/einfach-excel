//! 图表导出：类型元素、grouping、标题 / 图例 / 数据标签 / 坐标轴 / 颜色 / 字号 / 组合图次轴。

mod common;
use common::*;

fn chart_xml(payload: serde_json::Value) -> String {
    let refs = serde_json::json!([range(0, 0, 4, 3, None)]);
    export(&native(vec![chart("c", refs, payload)], serde_json::json!({}))).part("xl/charts/chart1.xml")
}

fn ax_ids(xml: &str, tag: &str) -> Vec<String> {
    xml.split(&format!("<{tag} val=\"")).skip(1).map(|rest| rest.split('"').next().unwrap().to_string()).collect()
}

#[test]
fn chart_types_and_groupings() {
    let col = chart_xml(serde_json::json!({"type": "column"}));
    assert!(col.contains(r#"<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>"#));
    assert!(!col.contains("<c:overlap"));
    let bar = chart_xml(serde_json::json!({"type": "bar", "stack": "stacked"}));
    assert!(bar.contains(r#"<c:barDir val="bar"/><c:grouping val="stacked"/>"#) && bar.contains(r#"<c:overlap val="100"/>"#));
    assert!(bar.contains(r#"<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>"#));
    assert!(chart_xml(serde_json::json!({"type": "column", "stack": "percent"})).contains(r#"<c:grouping val="percentStacked"/>"#));
    assert!(chart_xml(serde_json::json!({"type": "line"})).contains(r#"<c:lineChart><c:grouping val="standard"/>"#));
    assert!(chart_xml(serde_json::json!({"type": "line", "stack": "stacked"})).contains(r#"<c:grouping val="stacked"/>"#));
    assert!(chart_xml(serde_json::json!({"type": "area", "stack": "percent"})).contains(r#"<c:areaChart><c:grouping val="percentStacked"/>"#));
    let pie = chart_xml(serde_json::json!({"type": "pie"}));
    assert!(pie.contains(r#"<c:pieChart><c:varyColors val="1"/>"#) && !pie.contains("<c:catAx>") && !pie.contains("<c:valAx>"));
    let ring = chart_xml(serde_json::json!({"type": "doughnut"}));
    assert!(ring.contains(r#"<c:doughnutChart>"#) && ring.contains(r#"<c:holeSize val="50"/>"#));
    let scatter = chart_xml(serde_json::json!({"type": "scatter"}));
    assert!(scatter.contains(r#"<c:scatterStyle val="lineMarker"/>"#) && scatter.contains("<a:ln w=\"19050\"><a:noFill/></a:ln>"));
    assert_eq!(scatter.matches("<c:valAx>").count(), 2);
    assert!(!scatter.contains("<c:catAx>"));
}

#[test]
fn title_legend_labels_blanks_and_font() {
    let xml = chart_xml(serde_json::json!({"title": "A & B", "legend": "bottom", "dataLabels": true,
        "emptyCells": "connect", "showHidden": true, "fontSize": 14}));
    assert!(xml.contains("<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>A &amp; B</a:t>"));
    assert!(xml.contains(r#"<c:autoTitleDeleted val="0"/>"#));
    assert!(xml.contains(r#"<c:legendPos val="b"/>"#));
    assert!(xml.contains(r#"<c:showVal val="1"/>"#));
    assert!(xml.contains(r#"<c:plotVisOnly val="0"/><c:dispBlanksAs val="span"/>"#));
    assert!(xml.contains(r#"<a:defRPr sz="1400"/>"#));
    assert!(xml.contains(r#"<c:roundedCorners val="0"/>"#));

    let plain = chart_xml(serde_json::json!({"legend": "none"}));
    assert!(plain.contains(r#"<c:autoTitleDeleted val="1"/>"#) && !plain.contains("<c:title>"));
    assert!(!plain.contains("<c:legend>") && !plain.contains("<c:dLbls>") && !plain.contains("defRPr"));
    assert!(plain.contains(r#"<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>"#));
    for (name, pos) in [("top", "t"), ("left", "l"), ("right", "r")] {
        assert!(chart_xml(serde_json::json!({"legend": name})).contains(&format!(r#"<c:legendPos val="{pos}"/>"#)));
    }
}

#[test]
fn axes_titles_scale_gridlines_and_pairing() {
    let xml = chart_xml(serde_json::json!({"xTitle": "Region", "yTitle": "Units", "yMin": 0, "yMax": 99.5}));
    assert!(xml.contains("<a:t>Region</a:t>") && xml.contains("<a:t>Units</a:t>"));
    assert!(xml.contains(r#"<c:scaling><c:orientation val="minMax"/><c:max val="99.5"/><c:min val="0"/></c:scaling>"#));
    assert!(xml.contains("<c:majorGridlines/>"));
    assert!(!chart_xml(serde_json::json!({"gridlines": false})).contains("majorGridlines"));
    // 每个 axId 都有一个 crossAx 指向对方。
    let (ids, cross) = (ax_ids(&xml, "c:axId"), ax_ids(&xml, "c:crossAx"));
    assert_eq!(ids.len(), 4); // 图组引用 2 次 + 两根轴各声明 1 次
    assert_eq!(cross, [ids[3].clone(), ids[2].clone()]);
}

#[test]
fn colors_by_series_and_by_category_for_pie() {
    let cols = chart_xml(serde_json::json!({"colors": ["#ff0000", null, "00ff00"]}));
    assert!(cols.contains(r#"<c:spPr><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></c:spPr>"#));
    assert!(cols.contains(r#"val="00FF00""#));
    let line = chart_xml(serde_json::json!({"type": "line", "colors": ["#123456"]}));
    assert!(line.contains(r#"<a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="123456"/>"#));
    let pie = chart_xml(serde_json::json!({"type": "pie", "colors": ["#111111", "#222222"]}));
    assert!(pie.contains(r#"<c:dPt><c:idx val="1"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="222222"/>"#));
}

#[test]
fn combo_defaults_put_the_last_series_on_a_secondary_line() {
    let xml = chart_xml(serde_json::json!({"type": "combo"}));
    assert_eq!(xml.matches("<c:barChart>").count(), 1);
    assert_eq!(xml.matches("<c:lineChart>").count(), 1);
    assert_eq!(xml.matches("<c:catAx>").count(), 2);
    assert_eq!(xml.matches("<c:valAx>").count(), 2);
    assert!(xml.contains(r#"<c:delete val="1"/>"#) && xml.contains(r#"<c:crosses val="max"/>"#));
    assert!(xml.contains(r#"<c:axPos val="r"/>"#));
    // 线在次轴：lineChart 引用 1003/1004，柱引用 1001/1002。
    let line = &xml[xml.find("<c:lineChart>").unwrap()..xml.find("</c:lineChart>").unwrap()];
    assert!(line.contains(r#"<c:axId val="1003"/><c:axId val="1004"/>"#));
    assert!(line.contains(r#"<c:idx val="2"/>"#));
    let bar = &xml[xml.find("<c:barChart>").unwrap()..xml.find("</c:barChart>").unwrap()];
    assert!(bar.contains(r#"<c:idx val="0"/>"#) && bar.contains(r#"<c:idx val="1"/>"#) && !bar.contains(r#"<c:idx val="2"/>"#));
    // 四根轴两两互为 crossAx。
    let cross = ax_ids(&xml, "c:crossAx");
    assert_eq!(cross, ["1002", "1001", "1004", "1003"]);
}

#[test]
fn combo_overrides_move_series_between_groups_and_axes() {
    let xml = chart_xml(serde_json::json!({"type": "combo", "combo": [
        {"kind": "line"}, {"kind": "column", "secondary": true}, {"kind": "column", "secondary": false}]}));
    assert_eq!(xml.matches("<c:barChart>").count(), 2);
    assert_eq!(xml.matches("<c:lineChart>").count(), 1);
    assert!(!xml.contains(r#"<c:overlap"#));
    // 全部在次轴时退回主轴，不留空的主轴。
    let all = chart_xml(serde_json::json!({"type": "combo", "combo": [
        {"secondary": true}, {"secondary": true}, {"secondary": true}]}));
    assert_eq!(all.matches("<c:valAx>").count(), 1);
}
