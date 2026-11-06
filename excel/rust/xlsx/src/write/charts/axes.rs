//! 坐标轴：分类轴（catAx）与数值轴（valAx）。`axId` / `crossAx` 两两对应。

use super::elements::title;

pub struct CatAxis<'a> {
    pub id: u32,
    pub cross: u32,
    pub pos: &'a str,
    pub title: &'a str,
    pub deleted: bool,
}

pub struct ValAxis<'a> {
    pub id: u32,
    pub cross: u32,
    pub pos: &'a str,
    pub title: &'a str,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub gridlines: bool,
    /// 次坐标轴：与主轴交叉在另一侧。
    pub crosses_max: bool,
    /// 散点图两个轴都是数值轴，点落在刻度上。
    pub between_mid: bool,
}

const TICKS: &str = r#"<c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>"#;

pub fn cat_axis(axis: &CatAxis) -> String {
    let CatAxis { id, cross, pos, deleted, .. } = axis;
    let deleted = u8::from(*deleted);
    format!(
        r#"<c:catAx><c:axId val="{id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="{deleted}"/><c:axPos val="{pos}"/>{}{TICKS}<c:crossAx val="{cross}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>"#,
        title(axis.title)
    )
}

pub fn val_axis(axis: &ValAxis) -> String {
    let ValAxis { id, cross, pos, .. } = axis;
    // scaling 子元素顺序：orientation、max、min。
    let max = axis.max.map(|v| format!(r#"<c:max val="{v}"/>"#)).unwrap_or_default();
    let min = axis.min.map(|v| format!(r#"<c:min val="{v}"/>"#)).unwrap_or_default();
    let grid = if axis.gridlines { "<c:majorGridlines/>" } else { "" };
    let crosses = if axis.crosses_max { "max" } else { "autoZero" };
    let between = if axis.between_mid { "midCat" } else { "between" };
    format!(
        r#"<c:valAx><c:axId val="{id}"/><c:scaling><c:orientation val="minMax"/>{max}{min}</c:scaling><c:delete val="0"/><c:axPos val="{pos}"/>{grid}{}<c:numFmt formatCode="General" sourceLinked="1"/>{TICKS}<c:crossAx val="{cross}"/><c:crosses val="{crosses}"/><c:crossBetween val="{between}"/></c:valAx>"#,
        title(axis.title)
    )
}
