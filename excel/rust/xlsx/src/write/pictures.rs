//! 图片对象 → `xl/media/imageN.ext`（同一张图只写一份）+ drawing 里的 `xdr:pic` 锚点。
//! 只写字节在工作簿媒体库里的图片；外链图片（只有地址）不写，由调用方计入「图片或绘图」。

use std::collections::HashMap;

use super::package::Part;
use super::rels::Rels;
use super::xml::escape;
use crate::drawing_geometry::CellCorner;
use crate::native::NativeFile;
use crate::native_drawings::NativeDrawing;
use crate::native_media::{decode, extension, sniff_image_type};

/// 工作簿内已写出的图片：媒体 id → 包内路径。
#[derive(Default)]
pub struct MediaParts {
    written: HashMap<String, String>,
}

impl MediaParts {
    /// 返回 `xl/media/...` 路径；第一次见到某张图时追加二进制部件。字节缺失或格式不认返回 None。
    fn path(&mut self, file: &NativeFile, id: &str, parts: &mut Vec<Part>) -> Option<String> {
        if let Some(path) = self.written.get(id) {
            return Some(path.clone());
        }
        let media = file.workbook.media.iter().find(|media| media.id == id)?;
        let bytes = decode(&media.data)?;
        let mime = sniff_image_type(&bytes)?;
        let path = format!("xl/media/image{}.{}", self.written.len() + 1, extension(mime));
        parts.push(Part::binary(path.clone(), bytes));
        self.written.insert(id.to_string(), path.clone());
        Some(path)
    }
}

fn corner(tag: &str, c: CellCorner) -> String {
    format!("<xdr:{tag}><xdr:col>{}</xdr:col><xdr:colOff>{}</xdr:colOff><xdr:row>{}</xdr:row><xdr:rowOff>{}</xdr:rowOff></xdr:{tag}>",
        c.col, c.col_off_emu, c.row, c.row_off_emu)
}

/// 一张图片的锚点 XML；写不出（无字节）返回 None。
pub fn anchor(
    file: &NativeFile,
    object: &NativeDrawing,
    corners: (CellCorner, CellCorner),
    shape_id: usize,
    media: &mut MediaParts,
    drawing_rels: &mut Rels,
    parts: &mut Vec<Part>,
) -> Option<String> {
    let path = media.path(file, object.media.as_deref()?, parts)?;
    let rel_id = drawing_rels.add("image", &format!("../{}", path.trim_start_matches("xl/")), false);
    let alt = object.payload.get("alt").and_then(|alt| alt.as_str()).unwrap_or("");
    Some(format!(
        r#"<xdr:twoCellAnchor editAs="oneCell">{}{}<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="{shape_id}" name="{}" descr="{}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="{rel_id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>"#,
        corner("from", corners.0), corner("to", corners.1), escape(&object.id), escape(alt)))
}
