//! `c:ser` → 三条公式（名字格 / 类别或 X / 值或 Y）。值读不成引用（字面量、外部工作簿）时返回 `None`，
//! 调用方据此跳过整张图表。

use super::formula::{parse_formula, SheetRect};
use super::series::SeriesFormulas;
use crate::read::dom::Node;

enum Source {
    Absent,
    /// `numLit` / `strLit` / 只有缓存没有公式。
    Literal,
    /// 外部引用或认不出的写法。
    Unsupported,
    Ref(Vec<SheetRect>),
}

fn source(node: Option<&Node>) -> Source {
    let Some(node) = node else { return Source::Absent };
    for kind in ["strRef", "numRef", "multiLvlStrRef"] {
        if let Some(reference) = node.child(kind) {
            return match reference.child("f") {
                Some(formula) => parse_formula(&formula.text).map_or(Source::Unsupported, Source::Ref),
                None => Source::Literal,
            };
        }
    }
    if ["numLit", "strLit", "v"].iter().any(|name| node.child(name).is_some()) {
        Source::Literal
    } else {
        Source::Absent
    }
}

pub fn read_series(ser: &Node, scatter: bool) -> Option<SeriesFormulas> {
    let (cat_name, val_name) = if scatter { ("xVal", "yVal") } else { ("cat", "val") };
    let Source::Ref(val) = source(ser.child(val_name)) else { return None };
    let cat = match source(ser.child(cat_name)) {
        Source::Ref(rects) => Some(rects),
        // 散点没有 X 引用就成了按序号画，和原图不同，宁可跳过。
        Source::Literal | Source::Unsupported if scatter => return None,
        _ => None,
    };
    let (tx, name_lost) = match source(ser.child("tx")) {
        Source::Absent => (None, false),
        Source::Ref(rects) if rects.len() == 1 && rects[0].width() == 1 && rects[0].height() == 1 => {
            (Some(rects[0].clone()), false)
        }
        _ => (None, true),
    };
    Some(SeriesFormulas { tx, name_lost, cat, val })
}
