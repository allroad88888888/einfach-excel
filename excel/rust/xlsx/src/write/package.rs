//! 包级部件：内容类型、关系、workbook.xml、共享字符串。

use super::xml::escape;

const MAIN: &str = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const HEADER: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;

/// 工作簿里除固定部件外的附加部件（批注、VML、Table）。
pub struct Part {
    pub path: String,
    pub body: String,
    /// None 表示靠扩展名的 Default 内容类型（如 `.vml`）。
    pub content_type: Option<&'static str>,
}

pub fn content_types(sheets: usize, parts: &[Part]) -> String {
    let mut overrides = String::new();
    for part in parts {
        if let Some(kind) = part.content_type {
            overrides.push_str(&format!(r#"<Override PartName="/{}" ContentType="{kind}"/>"#, part.path));
        }
    }
    let vml = if parts.iter().any(|p| p.path.ends_with(".vml")) {
        r#"<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>"#
    } else {
        ""
    };
    for index in 1..=sheets {
        overrides.push_str(&format!(r#"<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#));
    }
    format!(r#"{HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>{vml}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>{overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>"#)
}

pub fn root_rels() -> String {
    format!(r#"{HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>"#)
}

pub fn workbook(names: &[String], defined_names: &str, manual_calculation: bool) -> String {
    let sheets: String = names.iter().enumerate()
        .map(|(index, name)| format!(r#"<sheet name="{}" sheetId="{}" r:id="rId{}"/>"#, escape(name), index + 1, index + 1))
        .collect();
    let calc_pr = if manual_calculation {
        r#"<calcPr calcId="191029" calcMode="manual"/>"#
    } else {
        r#"<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1"/>"#
    };
    // 公式只写源文本不写缓存值，按计算模式写出 calcPr。
    format!(r#"{HEADER}
<workbook xmlns="{MAIN}" xmlns:r="{REL}"><workbookPr/><bookViews><workbookView/></bookViews><sheets>{sheets}</sheets>{defined_names}{calc_pr}</workbook>"#)
}

pub fn workbook_rels(sheets: usize) -> String {
    let mut items = String::new();
    for index in 1..=sheets {
        items.push_str(&format!(r#"<Relationship Id="rId{index}" Type="{REL}/worksheet" Target="worksheets/sheet{index}.xml"/>"#));
    }
    format!(r#"{HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{items}<Relationship Id="rId{}" Type="{REL}/styles" Target="styles.xml"/><Relationship Id="rId{}" Type="{REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>"#,
        sheets + 1, sheets + 2)
}

pub fn shared_strings(items: &[String]) -> String {
    let body: String = items.iter()
        .map(|text| {
            let space = if text.starts_with(char::is_whitespace) || text.ends_with(char::is_whitespace) {
                r#" xml:space="preserve""#
            } else {
                ""
            };
            format!("<si><t{space}>{}</t></si>", escape(text))
        })
        .collect();
    format!(r#"{HEADER}
<sst xmlns="{MAIN}" count="{0}" uniqueCount="{0}">{body}</sst>"#, items.len())
}
