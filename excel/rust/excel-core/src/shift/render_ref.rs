//! 把一个引用（单元格地址 / 区域）写成 A1 文本，含 `$` 标注与写不出时的
//! `#REF!` 判定。
//!
//! 与 `render.rs` 分工：那边遍历 [`Expr`](crate::formula::Expr) 语法树、决定
//! 各节点的拼接顺序，引用节点的文本形状由这边定。

use super::edit::range_has_invalid_ref;
use crate::cell::{push_abs_addr, push_abs_col, push_abs_row, CellAddress};
use crate::formula::{RangeAbs, RangeBounds, RefAbs};

/// Render one cell address with its `$` absolute markers (`$A$1`, `$A1`,
/// `A$1`, `A1`). Absoluteness is a written-form annotation only; the address
/// coordinates are unchanged from `to_string_repr`.
///
/// 只做 `RefAbs` → 两个裸 `bool` 的拆包，写出实现是
/// [`crate::cell::push_abs_addr`] 那唯一一份。拆包留在这一侧而不是下沉进
/// `cell.rs`：`RefAbs` 住在 `formula::ast`，而 `formula` 依赖 `cell`，
/// 让 `cell` 反过来认识 `RefAbs` 就把依赖方向倒过来了。
pub(super) fn render_abs_addr(addr: CellAddress, abs: RefAbs, out: &mut String) {
    push_abs_addr(out, addr, abs.col, abs.row);
}

/// 一个能写成 A1 文本的区域形态 —— 决定坐标往哪条轴上写。
///
/// 这个类型的存在只为一件事：让 [`RangeBounds::Both`]（整表区域）在
/// [`render_range_body`] 里**无法表达**。`Both` 的四个角全是哨兵
/// （start `(0,0)`、end `(u32::MAX, u32::MAX)`），没有一个是用户写下的
/// 坐标，Excel 也没有对应的写法，所以它根本不是一种「可渲染形态」。
pub(super) enum RenderableRange {
    /// 两端都是真坐标：`A1:B3`。
    Corners,
    /// 行无界，只写列：`A:C`。
    WholeColumns,
    /// 列无界，只写行：`1:3`。
    WholeRows,
}

/// 这个区域该按哪种形态写？写不出文本时回 `None`，调用方写 `#REF!`。
/// 两种写不出：角上留着 `#REF!` 哨兵，或者它是整表区域（`Both`）。
///
/// **为什么 `Both` 当前不可达**：它在整个工作区**没有任何构造点**。唯一的
/// 产出方是解析器 `formula/refs.rs`，只写 `None` / `Rows` / `Cols`；
/// `auto_fill`、`shift::delta`、`shift::retarget` 重建 `Expr::Range` 时一律
/// `unbounded: *unbounded` 原样透传，不合成新判别式。归纳可得 AST 里的
/// `unbounded` 永远不是 `Both`。
///
/// **为什么不能让它走 `Corners` 那条路**：`range_has_invalid_ref` 对 `Both`
/// 会跳过两条轴、恒返回 false，于是哨兵直接喂进 `push_abs_addr`，那里要算
/// `row + 1` 即 `u32::MAX + 1`（debug 溢出 panic，release 回绕成 `0`）。改成
/// 饱和加法只是把 panic 换成一句重解析不回原树的垃圾文本，反而破掉
/// `render_formula` 那条往返不动点约束 —— 要的不是修算术，是承认这个形状
/// 写不出文本。
///
/// 与 `contains_invalid_ref` 对 `Both` 回 false 不矛盾：那个函数问「里面有没有
/// `#REF!` 哨兵」（没有），这里问「能不能写成文本」（不能）。
///
/// 注：`RangeBounds` 的文档说 `Both` 是给未来的 `A:XFD` 简写留位 —— 那其实是
/// `Rows`（行无界、列角是 `0..16383` 的真坐标），不是 `Both`。
pub(super) fn renderable_shape(
    start: CellAddress,
    end: CellAddress,
    unbounded: RangeBounds,
) -> Option<RenderableRange> {
    // 整列 / 整行区域只有有界那条轴可能带 `#REF!` 哨兵，无界轴上的
    // `u32::MAX` 是正常取值 —— `range_has_invalid_ref` 已按轴分别判定。
    if range_has_invalid_ref(start, end, unbounded) {
        return None;
    }
    match unbounded {
        RangeBounds::None => Some(RenderableRange::Corners),
        RangeBounds::Rows => Some(RenderableRange::WholeColumns),
        RangeBounds::Cols => Some(RenderableRange::WholeRows),
        RangeBounds::Both => None,
    }
}

/// 把区域的两个角按 `shape` 指定的轴写成 `起:止`（不含工作表前缀）。
pub(super) fn render_range_body(
    start: CellAddress,
    end: CellAddress,
    shape: RenderableRange,
    abs: RangeAbs,
    out: &mut String,
) {
    match shape {
        RenderableRange::Corners => {
            render_abs_addr(start, abs.start, out);
            out.push(':');
            render_abs_addr(end, abs.end, out);
        }
        RenderableRange::WholeColumns => {
            // Whole-column range — only the column carries a `$`.
            push_abs_col(out, start.col, abs.start.col);
            out.push(':');
            push_abs_col(out, end.col, abs.end.col);
        }
        RenderableRange::WholeRows => {
            // Whole-row range — only the row carries a `$`.
            push_abs_row(out, start.row, abs.start.row);
            out.push(':');
            push_abs_row(out, end.row, abs.end.row);
        }
    }
}
