//! quick-xml 的小工具：取属性、去命名空间前缀。

use quick_xml::events::BytesStart;

/// 元素本地名（去掉 `x:` 这类前缀）。
pub fn local_name(element: &BytesStart) -> Vec<u8> {
    element.local_name().as_ref().to_vec()
}

/// 取属性值（按本地名匹配，已反转义）；缺省返回 None。
pub fn attr(element: &BytesStart, name: &str) -> Option<String> {
    element.attributes().flatten().find_map(|attribute| {
        (attribute.key.local_name().as_ref() == name.as_bytes())
            .then(|| attribute.unescape_value().ok().map(|value| value.into_owned()))
            .flatten()
    })
}

pub fn attr_f64(element: &BytesStart, name: &str) -> Option<f64> {
    attr(element, name)?.parse().ok()
}

pub fn attr_u32(element: &BytesStart, name: &str) -> Option<u32> {
    attr(element, name)?.parse().ok()
}

/// OOXML 布尔属性：缺省为 `default`，"0"/"false" 为假。
pub fn attr_bool(element: &BytesStart, name: &str, default: bool) -> bool {
    attr(element, name).map_or(default, |value| value != "0" && value != "false")
}

/// 文本片段：普通文本原样解码，`&amp;`、`&#10;` 这类引用（0.39 起单独成事件）解析成字符。
pub fn text_of(event: &quick_xml::events::Event) -> Option<String> {
    use quick_xml::events::Event;
    match event {
        Event::Text(text) => text.xml_content().ok().map(|text| text.into_owned()),
        Event::CData(text) => text.decode().ok().map(|text| text.into_owned()),
        Event::GeneralRef(reference) => {
            if let Ok(Some(c)) = reference.resolve_char_ref() {
                return Some(c.to_string());
            }
            let name = reference.decode().ok()?;
            Some(match name.as_ref() {
                "lt" => "<", "gt" => ">", "amp" => "&", "quot" => "\"", "apos" => "'",
                _ => return None,
            }.to_string())
        }
        _ => None,
    }
}
