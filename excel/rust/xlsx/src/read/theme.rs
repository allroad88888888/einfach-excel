//! `theme1.xml` 的配色方案，按 XLSX `theme` 颜色索引顺序返回 RGB。

use quick_xml::events::Event;
use quick_xml::Reader;

use super::xml::{attr, local_name};
use crate::color::DEFAULT_THEME;

/// 文件里的顺序是 dk1 lt1 dk2 lt2 accent1..6 hlink folHlink，而颜色索引把前两对互换。
const SCHEME: [&[u8]; 12] = [
    b"lt1", b"dk1", b"lt2", b"dk2", b"accent1", b"accent2", b"accent3", b"accent4", b"accent5",
    b"accent6", b"hlink", b"folHlink",
];

pub fn parse(xml: Option<&str>) -> Vec<String> {
    let mut colors: Vec<String> = DEFAULT_THEME.iter().map(|c| c.to_string()).collect();
    let Some(xml) = xml else { return colors };
    let mut reader = Reader::from_str(xml);
    let mut slot: Option<usize> = None;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e) | Event::Empty(e)) => {
                let name = local_name(&e);
                if let Some(index) = SCHEME.iter().position(|key| *key == name.as_slice()) {
                    slot = Some(index);
                } else if let Some(index) = slot {
                    let rgb = match name.as_slice() {
                        b"srgbClr" => attr(&e, "val"),
                        b"sysClr" => attr(&e, "lastClr"),
                        _ => None,
                    };
                    if let Some(rgb) = rgb.filter(|v| v.len() == 6) {
                        colors[index] = rgb;
                        slot = None;
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    colors
}
