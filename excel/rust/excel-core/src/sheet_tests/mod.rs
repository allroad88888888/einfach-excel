//! `sheet.rs` 的单元测试。
//!
//! 拆自 `sheet.rs` 里那个 3,138 行的 `mod tests`。分组口径是**被测的东西**，
//! 不是行号；生产代码一行未动。
//!
//! 模块层级：本模块经 `#[path]` 挂在 `sheet.rs` 上，是 `sheet` 的子模块；下面
//! 这些是 `sheet` 的**孙**模块，所以回到 `sheet` 的私有项要写
//! `use super::super::*`（子模块能访问祖先私有项，但层数要写对）。
//!
//! 没有 `common.rs` —— 原 `mod tests` 除了两条 `use` 之外没有任何共用夹具，
//! 每条测试自带 `Sheet::new()`，拆开后各文件之间不需要共享任何东西。

mod array_gate;
mod atom_gc;
mod bulk_load;
mod cell_basics;
mod chain_scaling;
mod cycle_detect;
mod debug_counters;
mod deep_chain;
mod facade_rederive;
mod format_display;
mod format_layers;
mod formula_eval;
mod non_empty_enum;
mod notify_dedup;
mod prewarm_shortcircuit;
mod range_membership;
mod range_store_edges;
mod sparse_stream;
mod structural_edit;
mod subscribe;
mod unbounded_range;
