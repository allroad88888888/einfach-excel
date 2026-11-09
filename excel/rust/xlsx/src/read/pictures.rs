//! drawing 里的图片（`xdr:pic`）：按 `a:blip r:embed` 取 `xl/media` 字节，引擎支持的格式才读入。
//! 链接到外部地址、EMF/WMF/SVG 等引擎不收的格式返回 None，由调用方计入「图片或绘图」。

use super::archive::Archive;
use super::charts::tree;
use super::dom::Node;
use super::drawings::RawAnchor;
use super::rels::Relationship;
use crate::native_media::sniff_image_type;

/// 单张图片上限，与引擎一致。
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

pub struct RawPicture {
    pub name: Option<String>,
    pub anchor: RawAnchor,
    pub bytes: Vec<u8>,
    /// `cNvPr descr`（替代文字）。
    pub alt: Option<String>,
}

/// 锚点的直接内容是不是一张图片（组合里的图片不算）。
pub fn is_picture(anchor: &Node) -> bool {
    anchor.child("pic").is_some()
}

pub fn read(archive: &mut Archive, anchor: &Node, raw: RawAnchor, drawing_rels: &[Relationship]) -> Option<RawPicture> {
    let pic = anchor.child("pic")?;
    let embed = tree::first_descendant(pic, "blip")?.attr("embed")?;
    let rel = drawing_rels.iter().find(|rel| rel.id == embed && !rel.external && rel.kind.ends_with("/image"))?;
    let bytes = archive.read_bytes(&rel.target, MAX_IMAGE_BYTES)?;
    sniff_image_type(&bytes)?;
    let props = tree::first_descendant(pic, "cNvPr");
    Some(RawPicture {
        name: props.and_then(|node| node.attr("name")).map(str::to_string),
        alt: props.and_then(|node| node.attr("descr")).filter(|text| !text.is_empty()).map(str::to_string),
        anchor: raw,
        bytes,
    })
}
