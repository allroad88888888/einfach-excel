//! XLSX 压缩包：按路径读部件，解析 workbook 关系找到各工作表与共享部件。

use std::io::{Cursor, Read};

use quick_xml::events::Event;
use quick_xml::Reader;
use zip::ZipArchive;

use super::rels;
use super::xml::{attr, local_name};
use crate::XlsxError;

/// 单个部件解压后的上限，挡住压缩炸弹。
const MAX_PART_BYTES: u64 = 256 * 1024 * 1024;

pub struct Archive {
    zip: ZipArchive<Cursor<Vec<u8>>>,
}

pub struct SheetPart {
    pub name: String,
    pub path: String,
}

pub struct WorkbookParts {
    pub sheets: Vec<SheetPart>,
    pub shared_strings: Option<String>,
    pub styles: Option<String>,
    pub theme: Option<String>,
    pub date1904: bool,
    pub manual_calculation: bool,
    pub iterative_calculation: Option<crate::native::IterativeCalculation>,
    pub external_links: usize,
    pub pivot_caches: usize,
    pub macros: bool,
}

impl Archive {
    pub fn open(bytes: Vec<u8>) -> Result<Self, XlsxError> {
        let zip = ZipArchive::new(Cursor::new(bytes))
            .map_err(|_| XlsxError::new("This is not an .xlsx file (the zip container is unreadable)."))?;
        Ok(Self { zip })
    }

    pub fn read(&mut self, path: &str) -> Result<Option<String>, XlsxError> {
        let Ok(file) = self.zip.by_name(path.trim_start_matches('/')) else { return Ok(None) };
        let mut text = String::new();
        file.take(MAX_PART_BYTES + 1)
            .read_to_string(&mut text)
            .map_err(|_| XlsxError::new(format!("Part {path} is not valid UTF-8 XML.")))?;
        if text.len() as u64 > MAX_PART_BYTES {
            return Err(XlsxError::new(format!("Part {path} is larger than 256 MiB.")));
        }
        Ok(Some(text))
    }

    /// 二进制部件（图片）；超过 `limit` 字节或不存在返回 None。
    pub fn read_bytes(&mut self, path: &str, limit: usize) -> Option<Vec<u8>> {
        let file = self.zip.by_name(path.trim_start_matches('/')).ok()?;
        let mut bytes = Vec::new();
        file.take(limit as u64 + 1).read_to_end(&mut bytes).ok()?;
        (bytes.len() <= limit).then_some(bytes)
    }

    pub fn has_part(&mut self, path: &str) -> bool {
        self.zip.by_name(path.trim_start_matches('/')).is_ok()
    }

    pub fn count_prefix(&self, prefix: &str) -> usize {
        self.zip.file_names().filter(|name| name.starts_with(prefix) && !name.contains("/_rels/")).count()
    }

    pub fn workbook_parts(&mut self) -> Result<WorkbookParts, XlsxError> {
        let workbook = self.read("xl/workbook.xml")?
            .ok_or_else(|| XlsxError::new("The file has no xl/workbook.xml; it is not an Excel workbook."))?;
        let all_rels = rels::parse(&self.read("xl/_rels/workbook.xml.rels")?.unwrap_or_default(), "xl");
        let external_links = all_rels.iter().filter(|rel| rel.kind.ends_with("/externalLink")).count()
            .max(self.count_prefix("xl/externalLinks/"));
        let pivot_caches = all_rels.iter().filter(|rel| rel.kind.ends_with("/pivotCacheDefinition")).count();
        let macros = all_rels.iter().any(|rel| rel.kind.ends_with("/vbaProject"))
            || self.has_part("xl/vbaProject.bin");
        let rels: Vec<_> = all_rels.into_iter().filter(|rel| !rel.external).collect();
        let target = |id: &str| rels.iter().find(|rel| rel.id == id).map(|rel| rel.target.clone());
        let by_type = |suffix: &str| rels.iter()
            .find(|rel| rel.kind.ends_with(suffix))
            .map(|rel| rel.target.clone());

        let mut sheets = Vec::new();
        let mut date1904 = false;
        let mut manual_calculation = false;
        let mut iterative_calculation = None;
        let mut reader = Reader::from_str(&workbook);
        loop {
            match reader.read_event() {
                Ok(Event::Start(e) | Event::Empty(e)) => match local_name(&e).as_slice() {
                    b"sheet" => {
                        let name = attr(&e, "name").unwrap_or_default();
                        if let Some(path) = attr(&e, "id").and_then(|id| target(&id)) {
                            sheets.push(SheetPart { name, path });
                        }
                    }
                    b"workbookPr" => date1904 = attr(&e, "date1904").is_some_and(|v| v == "1" || v == "true"),
                    b"calcPr" => {
                        manual_calculation = attr(&e, "calcMode")
                            .is_some_and(|mode| mode.eq_ignore_ascii_case("manual"));
                        let iterate = attr(&e, "iterate")
                            .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));
                        let iterate_count =
                            attr(&e, "iterateCount").and_then(|v| v.parse::<u32>().ok());
                        let iterate_delta = attr(&e, "iterateDelta")
                            .and_then(|v| v.parse::<f64>().ok())
                            .filter(|v| v.is_finite() && *v >= 0.0);
                        if iterate || iterate_count.is_some() || iterate_delta.is_some() {
                            iterative_calculation = Some(crate::native::IterativeCalculation {
                                enabled: iterate,
                                max_iterations: iterate_count.unwrap_or(100).clamp(1, 32_767),
                                max_change: iterate_delta.unwrap_or(0.001),
                            });
                        }
                    }
                    _ => {}
                },
                Ok(Event::Eof) => break,
                Err(_) => return Err(XlsxError::new("xl/workbook.xml is not well-formed XML.")),
                _ => {}
            }
        }
        if sheets.is_empty() {
            return Err(XlsxError::new("The workbook has no worksheets."));
        }
        Ok(WorkbookParts {
            sheets,
            shared_strings: by_type("/sharedStrings"),
            styles: by_type("/styles"),
            theme: by_type("/theme"),
            date1904,
            manual_calculation,
            iterative_calculation,
            external_links,
            pivot_caches,
            macros,
        })
    }
}
