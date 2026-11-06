//! 树状图 / 旭日图：`cx:strDim type="cat"` 的一条公式覆盖多列层级，`numDim type="size"` 是最后一列数值。
//! 拼回插件的一块区域：层级列 + 数值列，首列是类别（`header_col`），名字格在数值列正上方时 `header_row`。

use crate::native_drawings::NativeRange;
use crate::read::charts::formula::{same_sheet, SheetRect};
use crate::read::charts::series::Joined;

/// 层级列必须紧挨在数值列左边、与数值同高、同一张表；对不上返回 `None`（跳过整张图）。
pub fn join(cat: &[SheetRect], val: &[SheetRect], tx: Option<&SheetRect>, name_lost: bool, own_sheet: &str) -> Option<Joined> {
    let ([cat], [val]) = (cat, val) else { return None };
    let [r1, c1, r2, c2] = cat.rect;
    let [vr1, vc1, vr2, vc2] = val.rect;
    if vc1 != vc2 || (r1, r2) != (vr1, vr2) || c2 + 1 != vc1 || !same_sheet(&cat.sheet, &val.sheet) {
        return None;
    }
    let above = tx.is_some_and(|tx| vr1 >= 1 && same_sheet(&tx.sheet, &val.sheet) && tx.rect == [vr1 - 1, vc1, vr1 - 1, vc1]);
    let sheet = (!val.sheet.is_empty() && !same_sheet(&val.sheet, own_sheet)).then(|| val.sheet.clone());
    Some(Joined {
        refs: vec![NativeRange { start_row: r1 - u32::from(above), start_col: c1, end_row: r2, end_col: vc1, sheet_name: sheet }],
        series_in: "columns",
        header_row: above,
        header_col: true,
        names_dropped: !above && (tx.is_some() || name_lost),
    })
}
