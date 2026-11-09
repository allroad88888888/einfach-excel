//! `c:ser` 里的趋势线（`c:trendline`）与误差线（`c:errBars`），位置在 `c:cat` / `c:xVal` 之前。
//! 只有柱、条、线、面积（非堆积）、散点、组合图写；其余类型一律不写。

use super::series_xml::SerKind;
use crate::chart_payload::ChartPayload;

/// 图表类型支持分析元素：堆积 / 百分比堆积的柱、条、线、面积不支持；散点、组合不受 `stack` 限制。
fn supported(kind: SerKind, p: &ChartPayload) -> bool {
    if !matches!(kind, SerKind::Bar | SerKind::Line | SerKind::Area | SerKind::Scatter) {
        return false;
    }
    match p.chart_type.as_str() {
        "scatter" | "combo" => true,
        "column" | "bar" | "line" | "area" => p.stack == "none",
        _ => false,
    }
}

pub fn xml(kind: SerKind, index: usize, color: Option<&str>, p: &ChartPayload) -> String {
    if !supported(kind, p) {
        return String::new();
    }
    let mut out = p.trendlines.get(index).and_then(Option::as_ref).map(|t| trendline(t, color)).unwrap_or_default();
    if let Some(bars) = &p.error_bars {
        out.push_str(&err_bars(bars, kind == SerKind::Scatter));
    }
    out
}

fn trendline(t: &crate::chart_analysis::Trendline, color: Option<&str>) -> String {
    let Some(kind) = (match t.kind.as_str() {
        "linear" => Some("linear"),
        "exponential" => Some("exp"),
        "logarithmic" => Some("log"),
        "polynomial" => Some("poly"),
        "power" => Some("power"),
        "movingAverage" => Some("movingAvg"),
        _ => None,
    }) else { return String::new() };
    let fill = color.map(|c| format!(r#"<a:solidFill><a:srgbClr val="{c}"/></a:solidFill>"#)).unwrap_or_default();
    let mut xml = format!(r#"<c:trendline><c:spPr><a:ln w="19050" cap="rnd">{fill}<a:prstDash val="sysDash"/></a:ln></c:spPr><c:trendlineType val="{kind}"/>"#);
    match kind {
        "poly" => xml.push_str(&format!(r#"<c:order val="{}"/>"#, t.order.clamp(2, 6))),
        "movingAvg" => xml.push_str(&format!(r#"<c:period val="{}"/>"#, t.period.clamp(2, 255))),
        _ => {}
    }
    // 移动平均没有公式与 R²。
    let (r2, eq) = if kind == "movingAvg" { (false, false) } else { (t.show_r2, t.show_equation) };
    xml.push_str(&format!(r#"<c:dispRSqr val="{}"/><c:dispEq val="{}"/>"#, u8::from(r2), u8::from(eq)));
    if r2 || eq {
        xml.push_str(r#"<c:trendlineLbl><c:numFmt formatCode="General" sourceLinked="0"/></c:trendlineLbl>"#);
    }
    xml.push_str("</c:trendline>");
    xml
}

/// Excel 只给散点系列写 `c:errDir`（`y`）。
fn err_bars(e: &crate::chart_analysis::ErrorBars, scatter: bool) -> String {
    let (Some(val_type), Some(bar_type)) = (
        match e.kind.as_str() { "fixed" => Some("fixedVal"), "percent" => Some("percentage"), "stdDev" => Some("stdDev"), "stdErr" => Some("stdErr"), _ => None },
        match e.direction.as_str() { "both" => Some("both"), "plus" => Some("plus"), "minus" => Some("minus"), _ => None },
    ) else { return String::new() };
    let mut xml = String::from("<c:errBars>");
    if scatter { xml.push_str(r#"<c:errDir val="y"/>"#); }
    xml.push_str(&format!(r#"<c:errBarType val="{bar_type}"/><c:errValType val="{val_type}"/><c:noEndCap val="0"/>"#));
    if val_type != "stdErr" && e.amount.is_finite() {
        xml.push_str(&format!(r#"<c:val val="{}"/>"#, e.amount));
    }
    xml.push_str(r#"<c:spPr><a:ln w="9525"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="65000"/><a:lumOff val="35000"/></a:schemeClr></a:solidFill></a:ln></c:spPr></c:errBars>"#);
    xml
}
