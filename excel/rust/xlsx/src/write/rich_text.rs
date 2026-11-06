use crate::native_rich_text::RichTextRun;
use super::xml::escape;

pub fn xml(runs: &[RichTextRun]) -> String {
    let mut xml = String::from("<is>");
    for run in runs {
        xml.push_str("<r><rPr>");
        let f = &run.format;
        for (tag, value) in [("b", f.bold), ("i", f.italic), ("strike", f.strikethrough)] {
            if let Some(value) = value { xml.push_str(&format!(r#"<{tag} val="{}"/>"#, u8::from(value))); }
        }
        if let Some(value) = f.underline { xml.push_str(if value { r#"<u val="single"/>"# } else { r#"<u val="none"/>"# }); }
        if let Some(size) = f.font_size { xml.push_str(&format!(r#"<sz val="{size}"/>"#)); }
        if let Some(family) = &f.font_family { xml.push_str(&format!(r#"<rFont val="{}"/>"#, escape(family))); }
        if let Some(color) = f.color.as_deref().and_then(crate::color::to_argb) { xml.push_str(&format!(r#"<color rgb="{color}"/>"#)); }
        xml.push_str(&format!("</rPr><t xml:space=\"preserve\">{}</t></r>", escape(&run.text)));
    }
    xml.push_str("</is>");
    xml
}
