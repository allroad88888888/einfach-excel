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
    /// 二进制部件（图片）；有值时写它而不是 `body`，内容类型按扩展名的 Default。
    pub bytes: Option<Vec<u8>>,
}

impl Part {
    pub fn binary(path: String, bytes: Vec<u8>) -> Self {
        Self { path, body: String::new(), content_type: None, bytes: Some(bytes) }
    }
}

/// 图片扩展名 → Default 内容类型。
const IMAGE_DEFAULTS: [(&str, &str); 5] = [
    ("png", "image/png"), ("jpeg", "image/jpeg"), ("gif", "image/gif"),
    ("webp", "image/webp"), ("bmp", "image/bmp"),
];

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
    let mut images = String::new();
    for (ext, mime) in IMAGE_DEFAULTS {
        if parts.iter().any(|p| p.bytes.is_some() && p.path.ends_with(&format!(".{ext}"))) {
            images.push_str(&format!(r#"<Default Extension="{ext}" ContentType="{mime}"/>"#));
        }
    }
    for index in 1..=sheets {
        overrides.push_str(&format!(r#"<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#));
    }
    format!(r#"{HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>{vml}{images}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>{overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>"#)
}

pub fn root_rels() -> String {
    format!(r#"{HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>"#)
}

pub fn workbook(
    names: &[String],
    defined_names: &str,
    manual_calculation: bool,
    iterative: Option<&crate::native::IterativeCalculation>,
) -> String {
    let sheets: String = names.iter().enumerate()
        .map(|(index, name)| format!(r#"<sheet name="{}" sheetId="{}" r:id="rId{}"/>"#, escape(name), index + 1, index + 1))
        .collect();
    let iter_attrs = match iterative {
        Some(iter)
            if iter.enabled
                || iter.max_iterations != 100
                || (iter.max_change - 0.001).abs() > 1e-12 =>
        {
            let flag = if iter.enabled { "1" } else { "0" };
            let count = iter.max_iterations.clamp(1, 32_767);
            let delta = if iter.max_change.is_finite() && iter.max_change >= 0.0 {
                iter.max_change
            } else {
                0.0
            };
            format!(r#" iterate="{flag}" iterateCount="{count}" iterateDelta="{delta}""#)
        }
        _ => String::new(),
    };
    let calc_pr = if manual_calculation {
        format!(r#"<calcPr calcId="191029" calcMode="manual"{iter_attrs}/>"#)
    } else {
        format!(r#"<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1"{iter_attrs}/>"#)
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
