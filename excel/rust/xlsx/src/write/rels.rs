//! 工作表的关系文件 `sheetN.xml.rels`：超链接目标、批注、VML 绘图、Table 部件。

use super::xml::escape;

const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

#[derive(Default)]
pub struct Rels {
    items: Vec<String>,
}

impl Rels {
    /// 登记一条关系，返回它的 `rIdN`。`kind` 是 `hyperlink` / `comments` / `vmlDrawing` / `table`。
    pub fn add(&mut self, kind: &str, target: &str, external: bool) -> String {
        let id = format!("rId{}", self.items.len() + 1);
        let mode = if external { r#" TargetMode="External""# } else { "" };
        self.items.push(format!(
            r#"<Relationship Id="{id}" Type="{REL}/{kind}" Target="{}"{mode}/>"#, escape(target)));
        id
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn to_xml(&self) -> String {
        format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{}</Relationships>"#,
            self.items.concat())
    }
}
