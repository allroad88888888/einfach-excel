//! 从 `src/eval.rs` 与 `eval_fn_*.rs` 的源码文本抽取内建函数名。
//!
//! `eval_func` 只保留路由选择器；真实的函数臂在分派子模块。这里分别抽取两者，
//! 让调用方断言它们的名字集合相等，再以真实臂集合校验保留名清单。

mod dispatch;
mod lex;
mod reserved;
mod source_family;

pub use dispatch::{actual_dispatches, routing_selectors, DispatchScan};
pub use reserved::{is_formula_name, reserved_macro_body, reserved_names};
pub use source_family::{
    eval_builtin_name_chars, eval_dispatch_chars, eval_family_chars,
};
