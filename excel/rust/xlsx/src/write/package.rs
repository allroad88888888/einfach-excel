//! 包级部件：内容类型、关系、workbook.xml、共享字符串。

use super::xml::escape;

const MAIN: &str = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const HEADER: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;

pub fn content_types(sheets: usize) -> String {
    let mut overrides = String::new();
    for index in 1..=sheets {
        overrides.push_str(&format!(r#"<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#));
    }
    format!(r#"{HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>{overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>"#)
}

pub fn root_rels() -> String {
    format!(r#"{HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>"#)
}

pub fn workbook(names: &[String]) -> String {
    let sheets: String = names.iter().enumerate()
        .map(|(index, name)| format!(r#"<sheet name="{}" sheetId="{}" r:id="rId{}"/>"#, escape(name), index + 1, index + 1))
        .collect();
    // 公式只写源文本不写缓存值，让 Excel 打开时全量重算。
    format!(r#"{HEADER}
<workbook xmlns="{MAIN}" xmlns:r="{REL}"><workbookPr/><bookViews><workbookView/></bookViews><sheets>{sheets}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>"#)
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
