//! 把一张工作表上的功能（条件格式、验证、超链接、批注、Table）拼成 `mergeCells` 之后的片段，
//! 同时产出关系与附加部件。元素顺序遵循 worksheet schema。

use super::package::Part;
use super::rels::Rels;
use super::styles::StyleTable;
use super::{comments, conditional, hyperlinks, tables, validation, vml};
use crate::native::NativeFile;

const COMMENTS_CONTENT_TYPE: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml";

/// 工作簿内递增的部件编号。
pub struct Counters {
    pub comments: usize,
    pub tables: usize,
}

pub struct SheetOut {
    pub tail: String,
    pub rels: Rels,
}

pub fn sheet(
    file: &NativeFile, index: usize, styles: &mut StyleTable, counters: &mut Counters, parts: &mut Vec<Part>,
) -> SheetOut {
    let book = &file.workbook;
    let mut rels = Rels::default();
    let conditional_formats: Vec<_> = book.conditional_formats.iter().filter(|c| c.sheet as usize == index).collect();
    let validations: Vec<_> = book.data_validations.iter().filter(|v| v.sheet == index).collect();
    let links: Vec<_> = book.hyperlinks.iter().filter(|l| l.sheet == index).collect();
    let sheet_tables: Vec<_> = book.tables.iter().filter(|t| t.sheet_index as usize == index).collect();

    let mut tail = conditional::xml(&conditional_formats, styles);
    tail.push_str(&validation::xml(&validations));
    tail.push_str(&hyperlinks::xml(&links, &mut rels));

    let texts = comments::collect(index, &book.notes, &book.comments);
    if !texts.is_empty() {
        let n = counters.comments;
        counters.comments += 1;
        rels.add("comments", &format!("../comments{n}.xml"), false);
        let vml_id = rels.add("vmlDrawing", &format!("../drawings/vmlDrawing{n}.vml"), false);
        parts.push(Part { path: format!("xl/comments{n}.xml"), body: comments::xml(&texts), content_type: Some(COMMENTS_CONTENT_TYPE) });
        parts.push(Part { path: format!("xl/drawings/vmlDrawing{n}.vml"), body: vml::xml(&texts, index), content_type: None });
        tail.push_str(&format!(r#"<legacyDrawing r:id="{vml_id}"/>"#));
    }
    tail.push_str(&tables::build(&sheet_tables, &mut counters.tables, &mut rels, parts));
    SheetOut { tail, rels }
}
