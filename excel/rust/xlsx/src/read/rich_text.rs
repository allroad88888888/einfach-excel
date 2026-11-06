//! Sparse run extraction: no XML tree or second copy of worksheet cell values.
use std::collections::HashMap;
use quick_xml::{events::{BytesStart, Event}, Reader};
use crate::native_rich_text::{RichTextFormat, RichTextRun};
use super::xml::{attr, attr_bool, attr_f64, attr_u32, local_name, text_of};

#[derive(Default)]
struct Entry {
    key: String,
    shared: bool,
    index: String,
    runs: Vec<RichTextRun>,
    rich: bool,
}

fn property(format: &mut RichTextFormat, e: &BytesStart, theme: &[String]) {
    match local_name(e).as_slice() {
        b"b" => format.bold = Some(attr_bool(e, "val", true)),
        b"i" => format.italic = Some(attr_bool(e, "val", true)),
        b"u" => format.underline = Some(attr(e, "val").as_deref() != Some("none")),
        b"strike" => format.strikethrough = Some(attr_bool(e, "val", true)),
        b"rFont" => format.font_family = attr(e, "val").filter(|s| !s.is_empty() && s.len() <= 128 && !s.chars().any(char::is_control)),
        b"sz" => format.font_size = attr_f64(e, "val").filter(|s| s.is_finite() && (1.0..=512.0).contains(s)),
        b"color" => format.color = if let Some(rgb) = attr(e, "rgb") { crate::color::from_argb(&rgb) }
            else if let Some(index) = attr_u32(e, "theme") { crate::color::from_theme(theme, index as usize, attr_f64(e, "tint").unwrap_or(0.0)) }
            else { attr_u32(e, "indexed").and_then(|i| crate::color::from_indexed(i as usize)) },
        _ => {}
    }
}

fn parse(xml: &str, entry_tag: &[u8], theme: &[String], mut emit: impl FnMut(Entry)) {
    let mut reader = Reader::from_str(xml);
    let mut current: Option<Entry> = None;
    let mut format = RichTextFormat::default();
    let (mut in_text, mut in_value, mut in_properties, mut phonetic) = (false, false, false, 0usize);
    loop {
        match reader.read_event() {
            Ok(event @ (Event::Start(_) | Event::Empty(_))) => {
                let empty = matches!(&event, Event::Empty(_));
                let e = match event { Event::Start(e) | Event::Empty(e) => e, _ => unreachable!() };
                let name = local_name(&e);
                if name == entry_tag {
                    current = Some(Entry { key: attr(&e, "r").unwrap_or_default(), shared: attr(&e, "t").as_deref() == Some("s"), ..Default::default() });
                    format = RichTextFormat::default();
                    (in_text, in_value, in_properties, phonetic) = (false, false, false, 0);
                    // Empty <si/> and <c/> still occupy their shared-string index or cell position.
                    if empty { emit(current.take().unwrap()); }
                } else if current.is_some() {
                    match name.as_slice() {
                        b"r" => { current.as_mut().unwrap().rich = true; format = RichTextFormat::default(); }
                        b"rPr" => in_properties = !empty,
                        b"rPh" => phonetic += usize::from(!empty),
                        b"t" => in_text = phonetic == 0 && !empty,
                        b"v" => in_value = !empty,
                        _ if in_properties => property(&mut format, &e, theme),
                        _ => {}
                    }
                }
            }
            Ok(ref piece @ (Event::Text(_) | Event::CData(_) | Event::GeneralRef(_))) => {
                if let (Some(entry), Some(text)) = (current.as_mut(), text_of(piece)) {
                    if in_value { entry.index.push_str(&text); }
                    else if in_text {
                        if let Some(last) = entry.runs.last_mut().filter(|r| r.format == format) { last.text.push_str(&text); }
                        else { entry.runs.push(RichTextRun { text, format: format.clone() }); }
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = e.local_name();
                match name.as_ref() {
                    name if name == entry_tag => { if let Some(entry) = current.take() { emit(entry); } }
                    b"t" => in_text = false,
                    b"v" => in_value = false,
                    b"rPr" => in_properties = false,
                    b"rPh" => phonetic = phonetic.saturating_sub(1),
                    _ => {}
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
}

pub fn shared(xml: &str, theme: &[String]) -> Vec<Vec<RichTextRun>> {
    let mut result = Vec::new();
    parse(xml, b"si", theme, |entry| result.push(if entry.rich { entry.runs } else { Vec::new() }));
    result
}

pub fn cells(xml: &str, shared: &[Vec<RichTextRun>], theme: &[String]) -> HashMap<(u32, u32), Vec<RichTextRun>> {
    let mut result = HashMap::new();
    parse(xml, b"c", theme, |entry| {
        let runs = if entry.shared { entry.index.trim().parse::<usize>().ok().and_then(|i| shared.get(i)).cloned().unwrap_or_default() }
            else if entry.rich { entry.runs } else { Vec::new() };
        if !runs.is_empty() { if let Some(coord) = crate::address::parse_cell(&entry.key) { result.insert(coord, runs); } }
    });
    result
}
