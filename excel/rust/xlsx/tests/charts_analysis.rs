//! 图表分析元素：趋势线、误差线、配色方案的导出（元素与顺序）和往返。

mod common;
use common::*;
use serde_json::{json, Value};

fn export_xml(payload: Value) -> (Exported, String) {
    let refs = json!([range(0, 0, 4, 3, None)]);
    let out = export(&native(vec![chart("c", refs, payload)], json!({})));
    let xml = out.part("xl/charts/chart1.xml");
    (out, xml)
}

fn xml_of(payload: Value) -> String {
    export_xml(payload).1
}

fn import_payload(out: &Exported) -> Value {
    let (text, _) = einfach_xlsx::xlsx_to_native_with_report(out.bytes.clone(), "Charts").unwrap();
    let back: Value = serde_json::from_str(&text).unwrap();
    back["workbook"]["drawings"][0]["drawings"][0]["payload"].clone()
}

fn round_trip(payload: Value) -> Value {
    import_payload(&export_xml(payload).0)
}

fn pos(xml: &str, needle: &str) -> usize {
    xml.find(needle).unwrap_or_else(|| panic!("missing {needle} in {xml}"))
}

#[test]
fn each_trendline_kind_is_written_before_the_categories() {
    for (kind, ty) in [("linear", "linear"), ("exponential", "exp"), ("logarithmic", "log"),
        ("polynomial", "poly"), ("power", "power"), ("movingAverage", "movingAvg")] {
        let xml = xml_of(json!({"type": "line", "trendlines": [{"kind": kind}]}));
        assert!(xml.contains(&format!(r#"<c:trendlineType val="{ty}"/>"#)), "{kind}");
        assert!(pos(&xml, "<c:trendline>") < pos(&xml, "<c:cat>"), "{kind}: trendline before cat");
        assert!(xml.contains(r#"<c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>"#), "{kind}");
        assert_eq!(xml.matches("<c:trendline>").count(), 1, "{kind}: only series 0");
    }
}

#[test]
fn trendline_details_order_period_labels_and_dashed_line() {
    let poly = xml_of(json!({"type": "column", "colors": ["#112233"],
        "trendlines": [{"kind": "polynomial", "order": 3, "showEquation": true, "showR2": true}]}));
    assert!(poly.contains(r#"<c:spPr><a:ln w="19050" cap="rnd"><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:prstDash val="sysDash"/></a:ln></c:spPr><c:trendlineType val="poly"/><c:order val="3"/><c:dispRSqr val="1"/><c:dispEq val="1"/><c:trendlineLbl><c:numFmt formatCode="General" sourceLinked="0"/></c:trendlineLbl></c:trendline>"#), "{poly}");
    let avg = xml_of(json!({"type": "line", "trendlines": [null, {"kind": "movingAverage", "period": 3, "showR2": true}]}));
    assert!(avg.contains(r#"<c:trendlineType val="movingAvg"/><c:period val="3"/><c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>"#), "{avg}");
    assert!(!avg.split("<c:trendline>").nth(1).unwrap().split("</c:trendline>").next().unwrap().contains("<c:order"));
    // 没有颜色：只有虚线。
    assert!(avg.contains(r#"<a:ln w="19050" cap="rnd"><a:prstDash val="sysDash"/></a:ln>"#));
    // 系列 1 的趋势线写在系列 1 里。
    assert!(pos(&avg, r#"<c:idx val="1"/>"#) < pos(&avg, "<c:trendline>"));
}

#[test]
fn error_bars_kinds_directions_and_position() {
    for (kind, ty, amount) in [("fixed", "fixedVal", 2.5), ("percent", "percentage", 5.0), ("stdDev", "stdDev", 2.0), ("stdErr", "stdErr", 1.0)] {
        for (dir, bar) in [("both", "both"), ("plus", "plus"), ("minus", "minus")] {
            let xml = xml_of(json!({"type": "column", "errorBars": {"kind": kind, "amount": amount, "direction": dir}}));
            assert!(xml.contains(&format!(r#"<c:errBars><c:errBarType val="{bar}"/><c:errValType val="{ty}"/><c:noEndCap val="0"/>"#)), "{kind}/{dir}");
            assert!(!xml.contains("<c:errDir"), "{kind}: errDir only for scatter");
            assert_eq!(xml.matches("<c:errBars>").count(), 3, "{kind}: every series");
            assert!(pos(&xml, "<c:errBars>") < pos(&xml, "<c:cat>"));
            assert_eq!(xml.contains("<c:val val=\"") && xml.contains(&format!(r#"<c:val val="{amount}"/><c:spPr>"#)), kind != "stdErr", "{kind}");
        }
    }
    let scatter = xml_of(json!({"type": "scatter", "trendlines": [{"kind": "linear", "showEquation": true}],
        "errorBars": {"kind": "fixed", "amount": 1, "direction": "both"}}));
    assert!(scatter.contains(r#"<c:errBars><c:errDir val="y"/><c:errBarType val="both"/>"#));
    assert!(pos(&scatter, "<c:trendline>") < pos(&scatter, "<c:errBars>") && pos(&scatter, "<c:errBars>") < pos(&scatter, "<c:xVal>"));
}

#[test]
fn unsupported_charts_never_write_analysis() {
    let analysis = json!({"trendlines": [{"kind": "linear"}], "errorBars": {"kind": "fixed", "amount": 1, "direction": "both"}});
    for (ty, stack) in [("column", "stacked"), ("bar", "percent"), ("line", "stacked"), ("area", "percent"), ("pie", "none"), ("doughnut", "none"), ("radar", "none")] {
        let mut payload = analysis.clone();
        payload["type"] = json!(ty);
        payload["stack"] = json!(stack);
        let xml = xml_of(payload);
        assert!(!xml.contains("<c:trendline>") && !xml.contains("<c:errBars>"), "{ty}/{stack}");
    }
    let stock = xml_of(json!({"type": "stock", "headerCol": false, "trendlines": [{"kind": "linear"}]}));
    assert!(!stock.contains("<c:trendline>"));
}

#[test]
fn stacked_column_trendlines_write_nothing_but_combo_ignores_stack() {
    let stacked = xml_of(json!({"type": "column", "stack": "stacked", "trendlines": [{"kind": "linear"}, {"kind": "power"}]}));
    assert!(!stacked.contains("c:trendline"));
    let combo = xml_of(json!({"type": "combo", "stack": "stacked", "trendlines": [{"kind": "linear"}]}));
    assert!(combo.contains("<c:trendline>"));
}

#[test]
fn palette_colours_series_without_explicit_colour() {
    let xml = xml_of(json!({"type": "column", "palette": "warm", "colors": ["#00FF00"]}));
    assert!(xml.contains(r#"<c:spPr><a:solidFill><a:srgbClr val="00FF00"/>"#));
    assert!(xml.contains(r#"<a:srgbClr val="F79646"/>"#) && xml.contains(r#"<a:srgbClr val="FFC000"/>"#));
    assert!(!xml.contains("C0504D"), "explicit colour wins at index 0");
    let office = xml_of(json!({"type": "column", "palette": "office"}));
    assert!(!office.contains("srgbClr"));
    // 股价图的涨跌色不跟配色方案走。
    let stock = xml_of(json!({"type": "stock", "headerCol": false, "palette": "warm"}));
    assert!(stock.contains("2E9E5B") && stock.contains("D64545") && !stock.contains("C0504D"));
    // 饼图按类别取色。
    let pie = xml_of(json!({"type": "pie", "palette": "cool"}));
    assert!(pie.contains(r#"<c:dPt><c:idx val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="4472C4"/>"#));
}

#[test]
fn analysis_round_trips_and_palette_comes_back_as_explicit_colours() {
    let trendlines = json!([
        {"kind": "polynomial", "order": 3, "period": 2, "showEquation": true, "showR2": true},
        {"kind": "movingAverage", "order": 2, "period": 3, "showEquation": false, "showR2": false},
        {"kind": "power", "order": 2, "period": 2, "showEquation": false, "showR2": true},
    ]);
    let bars = json!({"kind": "percent", "amount": 7.5, "direction": "minus"});
    let back = round_trip(json!({"type": "column", "palette": "green", "trendlines": trendlines, "errorBars": bars}));
    assert_eq!(back["trendlines"], trendlines);
    assert_eq!(back["errorBars"], bars);
    assert_eq!(back["palette"], "office");
    assert_eq!(back["colors"], json!(["#70AD47", "#43682B", "#8CC168"]));

    for (kind, amount) in [("fixed", 2.0), ("stdDev", 3.0), ("stdErr", 1.0)] {
        let bars = json!({"kind": kind, "amount": amount, "direction": "plus"});
        let back = round_trip(json!({"type": "scatter", "headerRow": true, "errorBars": bars,
            "trendlines": [null, {"kind": "logarithmic", "order": 2, "period": 2, "showEquation": true, "showR2": false}]}));
        assert_eq!(back["errorBars"], bars, "scatter {kind}");
        assert_eq!(back["trendlines"][0], Value::Null);
        assert_eq!(back["trendlines"][1]["kind"], "logarithmic");
    }
    // 没有趋势线时回到空数组。
    let plain = round_trip(json!({"type": "line", "trendlines": [null, null]}));
    assert_eq!((plain["trendlines"].clone(), plain["errorBars"].clone()), (json!([]), Value::Null));
}
