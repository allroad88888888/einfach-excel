//! 逐系列公式（名字格 / 类别 / 值）拼回图表的 `refs` + `series_in` + `header_row` + `header_col`。
//! 与导出的 split 互逆：值是竖条 → 按列，横条 → 按行（先转置成按列再处理，最后换回来）。

use super::formula::{same_sheet, SheetRect};
use crate::native_drawings::NativeRange;

/// 一个系列在 XML 里的三条公式。`tx` 只在是单个单元格时保留，其余写法记入 `name_lost`。
#[derive(Debug, Clone, Default)]
pub struct SeriesFormulas {
    pub tx: Option<SheetRect>,
    pub name_lost: bool,
    pub cat: Option<Vec<SheetRect>>,
    pub val: Vec<SheetRect>,
}

impl SeriesFormulas {
    fn swapped(&self) -> Self {
        Self {
            tx: self.tx.as_ref().map(SheetRect::swapped),
            name_lost: self.name_lost,
            cat: self.cat.as_ref().map(|rects| rects.iter().map(SheetRect::swapped).collect()),
            val: self.val.iter().map(SheetRect::swapped).collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Joined {
    pub refs: Vec<NativeRange>,
    pub series_in: &'static str,
    pub header_row: bool,
    pub header_col: bool,
    /// 系列名格还原不了，已丢掉名字。
    pub names_dropped: bool,
}

/// `strict_cats`（散点）：各系列的 X 必须一致，否则放弃整张图。
/// `own_sheet`：对象所在表（原始名），指向它的区域 `sheet_name` 记为 `None`。
pub fn join(series: &[SeriesFormulas], own_sheet: &str, strict_cats: bool) -> Option<Joined> {
    if series.is_empty() || series.iter().any(|s| s.val.is_empty()) {
        return None;
    }
    let vals = || series.iter().flat_map(|s| &s.val);
    let rows_mode = if vals().all(|v| v.width() == 1) {
        false
    } else if vals().all(|v| v.height() == 1) {
        true
    } else {
        return None;
    };
    let view: Vec<SeriesFormulas> =
        if rows_mode { series.iter().map(SeriesFormulas::swapped).collect() } else { series.to_vec() };
    let cols = join_columns(&view, strict_cats)?;
    let refs = cols.blocks.iter().map(|block| {
        let block = if rows_mode { block.swapped() } else { block.clone() };
        let [start_row, start_col, end_row, end_col] = block.rect;
        let sheet_name = (!block.sheet.is_empty() && !same_sheet(&block.sheet, own_sheet)).then_some(block.sheet);
        NativeRange { start_row, start_col, end_row, end_col, sheet_name }
    }).collect();
    let (names, cats) = (cols.names, cols.cats);
    Some(Joined {
        refs,
        series_in: if rows_mode { "rows" } else { "columns" },
        header_row: if rows_mode { cats } else { names },
        header_col: if rows_mode { names } else { cats },
        names_dropped: cols.names_dropped,
    })
}

struct Cols {
    blocks: Vec<SheetRect>,
    names: bool,
    cats: bool,
    names_dropped: bool,
}

/// 按列处理：每个值条是单列；名字格在条正上方，类别条与值条同高。
fn join_columns(series: &[SeriesFormulas], strict_cats: bool) -> Option<Cols> {
    let first = &series[0];
    let m = first.val.len();
    if series.iter().any(|s| s.val.len() != m) || (strict_cats && series.iter().any(|s| s.cat != first.cat)) {
        return None;
    }
    let cat = first.cat.as_ref().filter(|cat| {
        cat.len() == m && cat.iter().zip(&first.val).all(|(c, v)| {
            c.width() == 1 && c.rect[0] == v.rect[0] && c.rect[2] == v.rect[2]
        })
    });
    let names = series.iter().all(|s| name_is_above(s));
    let names_dropped = !names && series.iter().any(|s| s.tx.is_some() || s.name_lost);
    // 有的系列有名字、有的没有时也是丢名字，不能让 header_row 对不齐。
    let head = u32::from(names);
    let blocks = if m == 1 { one_strip_each(series, cat, head)? } else { stacked(series, cat, head)? };
    Some(Cols { blocks, names, cats: cat.is_some(), names_dropped })
}

fn name_is_above(series: &SeriesFormulas) -> bool {
    let (Some(tx), Some(val)) = (&series.tx, series.val.first()) else { return false };
    val.rect[0] >= 1 && same_sheet(&tx.sheet, &val.sheet) && tx.rect == [val.rect[0] - 1, val.rect[1], val.rect[0] - 1, val.rect[1]]
}

fn extend_up(rect: &SheetRect, head: u32) -> SheetRect {
    SheetRect { sheet: rect.sheet.clone(), rect: [rect.rect[0] - head, rect.rect[1], rect.rect[2], rect.rect[3]] }
}

/// 每个系列一条值：相邻对齐 → 一块；否则每条（及类别条）各成一块，要求同高。
fn one_strip_each(series: &[SeriesFormulas], cat: Option<&Vec<SheetRect>>, head: u32) -> Option<Vec<SheetRect>> {
    let vals: Vec<&SheetRect> = series.iter().map(|s| &s.val[0]).collect();
    if vals.iter().any(|v| v.height() != vals[0].height()) {
        return None;
    }
    let (first, last) = (vals[0], vals[vals.len() - 1]);
    let one_block = vals.iter().all(|v| same_sheet(&v.sheet, &first.sheet) && v.rect[0] == first.rect[0])
        && vals.windows(2).all(|pair| pair[1].rect[1] == pair[0].rect[3] + 1)
        && cat.is_none_or(|cat| same_sheet(&cat[0].sheet, &first.sheet) && cat[0].rect[3] + 1 == first.rect[1]);
    if one_block {
        let left = cat.map_or(first.rect[1], |cat| cat[0].rect[1]);
        let block = SheetRect { sheet: first.sheet.clone(), rect: [first.rect[0], left, first.rect[2], last.rect[3]] };
        return Some(vec![extend_up(&block, head)]);
    }
    let strips = cat.map(|cat| &cat[0]).into_iter().chain(vals).map(|rect| extend_up(rect, head));
    Some(merge_adjacent(strips))
}

/// 同表、同行、列紧挨的条合成一块，还原导出前的 `A1:A5,C1:D5` 而不是逐列三块。
fn merge_adjacent(strips: impl Iterator<Item = SheetRect>) -> Vec<SheetRect> {
    let mut blocks: Vec<SheetRect> = Vec::new();
    for strip in strips {
        match blocks.last_mut() {
            Some(last) if same_sheet(&last.sheet, &strip.sheet) && last.rect[0] == strip.rect[0]
                && last.rect[2] == strip.rect[2] && last.rect[3] + 1 == strip.rect[1] => last.rect[3] = strip.rect[3],
            _ => blocks.push(strip),
        }
    }
    blocks
}

/// 每个系列的值被切成 m 段（来自上下拼接的多块区域）：第 k 块 = 第 k 段的类别列 + 各系列列，需相邻。
fn stacked(series: &[SeriesFormulas], cat: Option<&Vec<SheetRect>>, head: u32) -> Option<Vec<SheetRect>> {
    let first = &series[0];
    let mut blocks = Vec::new();
    for (k, anchor) in first.val.iter().enumerate() {
        let aligned = |rect: &SheetRect| {
            same_sheet(&rect.sheet, &anchor.sheet) && rect.rect[0] == anchor.rect[0] && rect.rect[2] == anchor.rect[2]
        };
        if !series.iter().all(|s| aligned(&s.val[k])) || !cat.is_none_or(|cat| aligned(&cat[k])) {
            return None;
        }
        let cols: Vec<u32> = cat.map(|cat| cat[k].rect[1]).into_iter()
            .chain(series.iter().map(|s| s.val[k].rect[1])).collect();
        if !cols.windows(2).all(|pair| pair[1] == pair[0] + 1) {
            return None;
        }
        let top = if k == 0 { anchor.rect[0] - head } else { anchor.rect[0] };
        blocks.push(SheetRect { sheet: anchor.sheet.clone(), rect: [top, cols[0], anchor.rect[2], cols[cols.len() - 1]] });
    }
    // 各块同高时插件会当作左右拼接，没法还原成上下拼接。
    let same_height = blocks.iter().all(|b| b.height() == blocks[0].height());
    (!same_height).then_some(blocks)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(sheet: &str, rect: [u32; 4]) -> SheetRect {
        SheetRect { sheet: sheet.into(), rect }
    }

    fn col(tx: Option<[u32; 4]>, cat: Option<[u32; 4]>, val: [u32; 4]) -> SeriesFormulas {
        SeriesFormulas {
            tx: tx.map(|rect| r("Data", rect)),
            cat: cat.map(|rect| vec![r("Data", rect)]),
            val: vec![r("Data", val)],
            ..Default::default()
        }
    }

    fn range(rect: [u32; 4], sheet: Option<&str>) -> NativeRange {
        NativeRange { start_row: rect[0], start_col: rect[1], end_row: rect[2], end_col: rect[3], sheet_name: sheet.map(Into::into) }
    }

    #[test]
    fn adjacent_columns_with_names_and_categories_join_into_one_block() {
        let series = [
            col(Some([0, 1, 0, 1]), Some([1, 0, 4, 0]), [1, 1, 4, 1]),
            col(Some([0, 2, 0, 2]), Some([1, 0, 4, 0]), [1, 2, 4, 2]),
        ];
        let joined = join(&series, "Main", false).unwrap();
        assert_eq!(joined.refs, [range([0, 0, 4, 2], Some("Data"))]);
        assert_eq!((joined.series_in, joined.header_row, joined.header_col), ("columns", true, true));
        assert!(!joined.names_dropped);
        // 对象所在表不写表名。
        assert_eq!(join(&series, "data", false).unwrap().refs[0].sheet_name, None);
    }

    #[test]
    fn without_names_or_categories_the_flags_are_off() {
        let joined = join(&[col(None, None, [1, 1, 4, 1])], "Data", false).unwrap();
        assert_eq!(joined.refs, [range([1, 1, 4, 1], None)]);
        assert_eq!((joined.header_row, joined.header_col, joined.names_dropped), (false, false, false));
    }

    #[test]
    fn separated_series_become_blocks_with_the_category_corner_and_adjacent_strips_merged() {
        let series = [
            col(Some([0, 1, 0, 1]), Some([1, 0, 4, 0]), [1, 1, 4, 1]),
            col(Some([0, 4, 0, 4]), Some([1, 0, 4, 0]), [1, 4, 4, 4]),
        ];
        let joined = join(&series, "Data", false).unwrap();
        // 类别列 A 与第一个系列 B 紧挨，合成 A:B；E 单独一块。
        assert_eq!(joined.refs, [range([0, 0, 4, 1], None), range([0, 4, 4, 4], None)]);
        assert_eq!((joined.header_row, joined.header_col), (true, true));
    }

    #[test]
    fn horizontal_strips_are_series_in_rows() {
        let row = |r0: u32| SeriesFormulas {
            tx: Some(r("Data", [r0, 0, r0, 0])),
            cat: Some(vec![r("Data", [0, 1, 0, 3])]),
            val: vec![r("Data", [r0, 1, r0, 3])],
            ..Default::default()
        };
        let joined = join(&[row(1), row(2)], "Data", false).unwrap();
        assert_eq!(joined.refs, [range([0, 0, 2, 3], None)]);
        // 按行：名字在首列（header_col），类别在首行（header_row）。
        assert_eq!((joined.series_in, joined.header_row, joined.header_col), ("rows", true, true));
    }

    #[test]
    fn names_that_are_not_adjacent_are_dropped_and_reported() {
        let series = [col(Some([9, 9, 9, 9]), Some([1, 0, 4, 0]), [1, 1, 4, 1])];
        let joined = join(&series, "Data", false).unwrap();
        assert!(joined.names_dropped);
        assert_eq!(joined.refs, [range([1, 0, 4, 1], None)]);
        assert_eq!((joined.header_row, joined.header_col), (false, true));
        let lost = SeriesFormulas { name_lost: true, val: vec![r("Data", [1, 1, 4, 1])], ..Default::default() };
        assert!(join(&[lost], "Data", false).unwrap().names_dropped);
    }

    #[test]
    fn single_cell_series_are_read_by_columns() {
        let joined = join(&[col(Some([0, 1, 0, 1]), None, [1, 1, 1, 1])], "Data", false).unwrap();
        assert_eq!(joined.refs, [range([0, 1, 1, 1], None)]);
        assert_eq!((joined.series_in, joined.header_row, joined.header_col), ("columns", true, false));
    }

    #[test]
    fn unions_from_stacked_blocks_join_back_into_stacked_blocks() {
        let union = |c: u32| vec![r("Data", [1, c, 4, c]), r("Data", [8, c, 10, c])];
        let series = [1u32, 2].map(|c| SeriesFormulas {
            tx: Some(r("Data", [0, c, 0, c])),
            cat: Some(union(0)),
            val: union(c),
            ..Default::default()
        });
        let joined = join(&series, "Data", false).unwrap();
        assert_eq!(joined.refs, [range([0, 0, 4, 2], None), range([8, 0, 10, 2], None)]);
        assert_eq!((joined.series_in, joined.header_row, joined.header_col), ("columns", true, true));
    }

    #[test]
    fn scatter_with_different_x_values_cannot_be_represented() {
        let series = [col(None, Some([1, 0, 4, 0]), [1, 1, 4, 1]), col(None, Some([1, 5, 4, 5]), [1, 6, 4, 6])];
        assert!(join(&series, "Data", true).is_none());
        assert!(join(&series, "Data", false).is_some());
    }
}
