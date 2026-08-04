//! 公式引用的重写：一次编辑（插删行列 / 复制粘贴 / 表重命名）进，重写后的
//! 公式（[`Expr`](crate::formula::Expr) 语法树，或公式源码文本）出。
//!
//! 一组纯函数，按职责切成几片（本文件只做装配，实现全在 `shift/` 下）：
//!
//! | 子模块 | 负责 |
//! |---|---|
//! | `edit` | 「一次插删行列编辑」这个抽象：它把单个坐标映射到哪里 |
//! | `retarget` | 结构编辑之后按新坐标重写 AST 里的地址 |
//! | `delta` | 复制粘贴时按 `(drow, dcol)` 增量平移 AST 里的地址 |
//! | `parked` | 在未解析的公式源码文本上重写被编辑移动的引用记号 |
//! | `parked_scan` | 公式源码字节流上的记号识别 |
//! | `parked_band` | 整列 / 整行范围记号在源码文本上的重写 |
//! | `render` | 把 AST 渲染回公式源码文本 |
//! | `render_number` | 数字字面量渲染回源码时挑普通写法还是科学计数 |
//! | `render_ref` | 单元格地址 / 区域引用写成 A1 文本时的 `$` 与 `#REF!` 形状 |
//! | `table_ref` | 表名 / 列名改掉之后重写结构化引用节点 |
//!
//! 子模块一律私有，公开面由本文件逐项 `pub use` 出去 —— `crate::shift::X`
//! 的路径与拆分前逐字相同，调用点不需要跟着改。

mod delta;
mod edit;
mod parked;
mod parked_band;
mod parked_scan;
mod render;
mod render_number;
mod render_ref;
mod retarget;
mod table_ref;

pub use delta::shift_refs;
pub use edit::{
    contains_invalid_ref, shift_addr_col_delete, shift_addr_col_insert, shift_addr_row_delete,
    shift_addr_row_insert, ShiftEdit, REF_INVALID_COL, REF_INVALID_ROW,
};
pub use parked::{rewrite_parked_source, SourceRewrite};
pub use render::render_formula;
pub use retarget::map_addrs;

pub(crate) use table_ref::{rewrite_table_refs, TableRefEditSpec};
