//! 小型 XML 树：功能部件（批注、表、验证、条件格式）都很小，按树读比逐事件状态机清楚。
//! 元素与属性都只保留本地名（去命名空间前缀）。

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use super::xml::text_of;

#[derive(Debug, Default, Clone)]
pub struct Node {
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub text: String,
    pub children: Vec<Node>,
}

impl Node {
    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attrs.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }

    pub fn attr_u32(&self, name: &str) -> Option<u32> {
        self.attr(name)?.trim().parse().ok()
    }

    pub fn attr_f64(&self, name: &str) -> Option<f64> {
        self.attr(name)?.trim().parse().ok()
    }

    pub fn attr_bool(&self, name: &str, default: bool) -> bool {
        self.attr(name).map_or(default, |value| value != "0" && value != "false")
    }

    pub fn child(&self, name: &str) -> Option<&Node> {
        self.children.iter().find(|child| child.name == name)
    }

    pub fn each<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Node> {
        self.children.iter().filter(move |child| child.name == name)
    }
}

fn element(e: &BytesStart) -> Node {
    let attrs = e.attributes().flatten().filter_map(|a| {
        let value = a.unescape_value().ok()?.into_owned();
        Some((String::from_utf8_lossy(a.key.local_name().as_ref()).into_owned(), value))
    }).collect();
    Node { name: String::from_utf8_lossy(e.local_name().as_ref()).into_owned(), attrs, ..Default::default() }
}

/// 解析整个文档，返回根元素。`skip` 里的元素名（如 `sheetData`）整棵跳过。
pub fn parse(xml: &str, skip: &[&str]) -> Option<Node> {
    let mut reader = Reader::from_str(xml);
    let mut stack: Vec<Node> = Vec::new();
    let mut root = None;
    loop {
        match reader.read_event().ok()? {
            Event::Start(e) => {
                let node = element(&e);
                if skip.contains(&node.name.as_str()) {
                    reader.read_to_end(e.name()).ok()?;
                } else {
                    stack.push(node);
                }
            }
            Event::Empty(e) => {
                let node = element(&e);
                if skip.contains(&node.name.as_str()) {
                    continue;
                }
                match stack.last_mut() {
                    Some(parent) => parent.children.push(node),
                    None => root = Some(node),
                }
            }
            ref piece @ (Event::Text(_) | Event::CData(_) | Event::GeneralRef(_)) => {
                if let (Some(top), Some(text)) = (stack.last_mut(), text_of(piece)) {
                    top.text.push_str(&text);
                }
            }
            Event::End(_) => {
                let node = stack.pop()?;
                match stack.last_mut() {
                    Some(parent) => parent.children.push(node),
                    None => root = Some(node),
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    root
}
