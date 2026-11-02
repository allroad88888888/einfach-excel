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

#[derive(Default)]
pub struct Theme {
    pub colors: Vec<String>,
    pub custom_fonts: usize,
}

pub fn parse(xml: Option<&str>) -> Theme {
    let mut colors: Vec<String> = DEFAULT_THEME.iter().map(|c| c.to_string()).collect();
    let Some(xml) = xml else { return Theme { colors, custom_fonts: 0 } };
    let mut reader = Reader::from_str(xml);
    let mut slot: Option<usize> = None;
    let mut in_font_scheme = false;
    let mut custom_fonts = 0usize;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e) | Event::Empty(e)) => {
                let name = local_name(&e);
                if name == b"fontScheme" {
                    in_font_scheme = true;
                } else if in_font_scheme && name == b"latin" {
                    if let Some(typeface) = attr(&e, "typeface") {
                        if !typeface.is_empty()
                            && !matches!(
                                typeface.as_str(),
                                "Calibri"
                                    | "Calibri Light"
                                    | "Cambria"
                                    | "Aptos"
                                    | "Aptos Display"
                                    | "Aptos Narrow"
                            )
                        {
                            custom_fonts += 1;
                        }
                    }
                } else if let Some(index) = SCHEME.iter().position(|key| *key == name.as_slice()) {
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
            Ok(Event::End(e)) if e.local_name().as_ref() == b"fontScheme" => in_font_scheme = false,
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    Theme { colors, custom_fonts }
}
