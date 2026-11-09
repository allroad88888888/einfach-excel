//! chartEx 的样式（chartStyle）与配色（colorStyle）部件。Excel 打开 chartEx 时要求两者都在，
//! 缺了或条目不全会判为损坏（Mac Excel 16.114 实测）；普通 `c:` 图表不需要。
//! 内容由本模块按 chartStyle 架构生成：每个条目引用主题默认值，系列按主题色循环自动着色。

pub const STYLE_CONTENT_TYPE: &str = "application/vnd.ms-office.chartstyle+xml";
pub const COLORS_CONTENT_TYPE: &str = "application/vnd.ms-office.chartcolorstyle+xml";
pub const STYLE_REL_TYPE: &str = "http://schemas.microsoft.com/office/2011/relationships/chartStyle";
pub const COLORS_REL_TYPE: &str = "http://schemas.microsoft.com/office/2011/relationships/chartColorStyle";

const HEADER: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;
const NS: &str = r#"xmlns:cs="http://schemas.microsoft.com/office/drawing/2012/chartStyle" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main""#;

/// chartStyle 要求按此顺序出现的全部条目。
const ENTRIES: [&str; 31] = ["axisTitle", "categoryAxis", "chartArea", "dataLabel", "dataLabelCallout",
    "dataPoint", "dataPoint3D", "dataPointLine", "dataPointMarker", "dataPointMarkerLayout",
    "dataPointWireframe", "dataTable", "downBar", "dropLine", "errorBar", "floor", "gridlineMajor",
    "gridlineMinor", "hiLoLine", "leaderLine", "legend", "plotArea", "plotArea3D", "seriesAxis",
    "seriesLine", "title", "trendline", "trendlineLabel", "upBar", "valueAxis", "wall"];

const FONT: &str = r#"<cs:fontRef idx="minor"><a:schemeClr val="tx1"><a:lumMod val="65000"/><a:lumOff val="35000"/></a:schemeClr></cs:fontRef>"#;
const NO_REFS: &str = r#"<cs:lnRef idx="0"/><cs:fillRef idx="0"/><cs:effectRef idx="0"/>"#;
const LIGHT_LINE: &str = r#"<a:ln w="9525"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="15000"/><a:lumOff val="85000"/></a:schemeClr></a:solidFill></a:ln>"#;

fn entry(name: &str) -> String {
    let body = match name {
        "dataPointMarkerLayout" => return r#"<cs:dataPointMarkerLayout symbol="circle" size="5"/>"#.into(),
        // 系列：填充 / 线条取主题色循环（styleClr auto → phClr）。
        "dataPoint" | "dataPoint3D" | "dataPointMarker" => format!(
            r#"<cs:lnRef idx="0"/><cs:fillRef idx="1"><cs:styleClr val="auto"/></cs:fillRef><cs:effectRef idx="0"/>{FONT}<cs:spPr><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></cs:spPr>"#),
        "dataPointLine" | "dataPointWireframe" => format!(
            r#"<cs:lnRef idx="0"><cs:styleClr val="auto"/></cs:lnRef><cs:fillRef idx="1"/><cs:effectRef idx="0"/>{FONT}<cs:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></cs:spPr>"#),
        "gridlineMajor" | "gridlineMinor" | "leaderLine" | "dropLine" | "hiLoLine" | "seriesLine" | "errorBar" =>
            format!("{NO_REFS}{FONT}<cs:spPr>{LIGHT_LINE}</cs:spPr>"),
        "chartArea" => format!(
            r#"{NO_REFS}{FONT}<cs:spPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill>{LIGHT_LINE}</cs:spPr><cs:defRPr sz="1000"/>"#),
        "title" => format!(r#"{NO_REFS}{FONT}<cs:defRPr sz="1400"/>"#),
        "axisTitle" => format!(r#"{NO_REFS}{FONT}<cs:defRPr sz="1000"/>"#),
        "categoryAxis" | "valueAxis" | "seriesAxis" | "dataLabel" | "legend" | "trendlineLabel" | "dataTable" =>
            format!(r#"{NO_REFS}{FONT}<cs:defRPr sz="900"/>"#),
        _ => format!("{NO_REFS}{FONT}"),
    };
    format!("<cs:{name}>{body}</cs:{name}>")
}

/// `style_id` 只是标识，取 Excel 对该类图表的默认样式编号。
pub fn style_xml(style_id: u32) -> String {
    let entries: String = ENTRIES.iter().map(|name| entry(name)).collect();
    format!(r#"{HEADER}<cs:chartStyle {NS} id="{style_id}">{entries}</cs:chartStyle>"#)
}

pub fn colors_xml() -> String {
    let accents: String = (1..=6).map(|n| format!(r#"<a:schemeClr val="accent{n}"/>"#)).collect();
    format!(r#"{HEADER}<cs:colorStyle {NS} meth="cycle" id="10">{accents}<cs:variation/></cs:colorStyle>"#)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn style_lists_every_schema_entry_once_in_order() {
        let xml = style_xml(395);
        let mut at = 0;
        for name in ENTRIES {
            let found = xml[at..].find(&format!("<cs:{name}")).unwrap_or_else(|| panic!("missing {name}"));
            at += found + 1;
        }
        assert!(xml.contains(r#"id="395""#) && colors_xml().contains(r#"meth="cycle""#));
    }
}
