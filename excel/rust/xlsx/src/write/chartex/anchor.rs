//! drawing 里的 chartEx 锚点：Excel 用 `mc:AlternateContent` 包住 graphicFrame，
//! 不认识 chartEx 的旧版本显示 Fallback 里的提示形状。

use crate::drawing_geometry::CellCorner;
use crate::write::xml::escape;

pub const CONTENT_TYPE: &str = "application/vnd.ms-office.chartex+xml";
/// drawing rels 里 chartEx 关系的完整类型（不在 officeDocument 命名空间下）。
pub const REL_TYPE: &str = "http://schemas.microsoft.com/office/2014/relationships/chartEx";

fn corner(tag: &str, c: CellCorner) -> String {
    format!("<xdr:{tag}><xdr:col>{}</xdr:col><xdr:colOff>{}</xdr:colOff><xdr:row>{}</xdr:row><xdr:rowOff>{}</xdr:rowOff></xdr:{tag}>",
        c.col, c.col_off_emu, c.row, c.row_off_emu)
}

/// 六种类型都用 cx1（2015/9/8）。漏斗图写成 cx2（2015/10/21）时 Mac Excel 16.114 只显示 Fallback，实测 cx1 正常。
pub fn anchor(shape_id: usize, name: &str, from: CellCorner, to: CellCorner, rel_id: &str) -> String {
    let (prefix, uri) = ("cx1", "http://schemas.microsoft.com/office/drawing/2015/9/8/chartex");
    format!(r#"<xdr:twoCellAnchor editAs="oneCell">{}{}<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:{prefix}="{uri}" Requires="{prefix}"><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="{shape_id}" name="{}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2014/chartex"><cx:chart xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" r:id="{rel_id}"/></a:graphicData></a:graphic></xdr:graphicFrame></mc:Choice><mc:Fallback><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="0" name=""/><xdr:cNvSpPr><a:spLocks noTextEdit="1"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="2743200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:prstClr val="white"/></a:solidFill><a:ln w="1"><a:solidFill><a:prstClr val="green"/></a:solidFill></a:ln></xdr:spPr><xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1100"/><a:t>This chart isn't available in your version of Excel.</a:t></a:r></a:p></xdr:txBody></xdr:sp></mc:Fallback></mc:AlternateContent><xdr:clientData/></xdr:twoCellAnchor>"#,
        corner("from", from), corner("to", to), escape(name))
}
