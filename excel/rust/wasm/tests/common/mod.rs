//! 自定义公式 wasm 测试的共享脚手架。
//!
//! `tests/common/mod.rs` 不会被 cargo 当成独立的测试二进制（只有
//! `tests/*.rs` 会），所以放这里的东西是纯粹的被 `mod common;` 引入的
//! 辅助代码，不会凭空多出一个空测试套件。

#![cfg(target_arch = "wasm32")]

use wasm_bindgen::closure::Closure;
use wasm_bindgen::prelude::*;

/// 把一个 Rust 闭包包成 `js_sys::Function`：入参是 args 数组，返回
/// `JsValue`。宿主注册的自定义公式在测试里就长这样。
///
/// 闭包被 `forget` 掉（刻意泄漏）：wasm-bindgen-test 每个测试是一个作用域
/// 内的 future，不泄漏的话闭包会在 JS 侧（workbook 注册表）还持有引用时
/// 就被 drop。泄漏量以单个测试为界，可接受。
pub fn make_js_fn<F>(body: F) -> js_sys::Function
where
    F: FnMut(js_sys::Array) -> JsValue + 'static,
{
    let closure = Closure::wrap(Box::new(body) as Box<dyn FnMut(js_sys::Array) -> JsValue>);
    let func: js_sys::Function = closure.as_ref().unchecked_ref::<js_sys::Function>().clone();
    closure.forget();
    func
}
