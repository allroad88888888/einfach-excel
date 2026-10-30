//! `sharedStrings.xml`：每个 `<si>` 拼接其中全部 `<t>`（富文本各段只取文字）。

use quick_xml::events::Event;
use quick_xml::Reader;

use super::xml::{local_name, text_of};
use crate::XlsxError;

pub fn parse(xml: &str) -> Result<Vec<String>, XlsxError> {
    let mut strings = Vec::new();
    let mut reader = Reader::from_str(xml);
    let mut current: Option<String> = None;
    let mut in_text = false;
    // 注音（<rPh>）里的 <t> 不是正文。
    let mut phonetic = 0usize;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) => match local_name(&e).as_slice() {
                b"si" => current = Some(String::new()),
                b"t" => in_text = phonetic == 0,
                b"rPh" => phonetic += 1,
                _ => {}
            },
            Ok(Event::Empty(e)) if local_name(&e) == b"si" => strings.push(String::new()),
            Ok(ref event @ (Event::Text(_) | Event::CData(_) | Event::GeneralRef(_))) if in_text => {
                if let (Some(value), Some(text)) = (current.as_mut(), text_of(event)) {
                    value.push_str(&text);
                }
            }
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"si" => strings.push(current.take().unwrap_or_default()),
                b"t" => in_text = false,
                b"rPh" => phonetic = phonetic.saturating_sub(1),
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(_) => return Err(XlsxError::new("xl/sharedStrings.xml is not well-formed XML.")),
            _ => {}
        }
    }
    Ok(strings)
}
