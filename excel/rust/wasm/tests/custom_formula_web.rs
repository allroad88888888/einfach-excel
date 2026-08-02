//! Wave 8 —— 宿主自定义公式的**注册生命周期与标量回程**契约测试。
//!
//! 从 `web.rs` 拆出来：那边管的是 wasm 桥的通用行为（订阅回调的
//! microtask defer、panic hook、批量安装）。数组回程另有一份
//! `custom_formula_array_web.rs`，因为那是独立的一件事（形状规则、
//! 尺寸闸门、溢出碰撞），与「注册了没有、标量对不对」不是同一个场景。
//!
//! 跑法：
//! ```bash
//! wasm-pack test --node excel/rust/wasm
//! ```
//!
//! **刻意不加 `wasm_bindgen_test_configure!(run_in_browser)`**（`web.rs` 有）。
//! 那边需要浏览器是因为它盯的是 `queueMicrotask` 的事件循环时序和 panic
//! hook 的「记录并存活」行为，只有真浏览器才算数。本文件全是同步的引擎调用
//! ＋ 值边界断言，node 与浏览器语义一致 —— 不绑浏览器就意味着不需要
//! chromedriver 也能跑，本地和 CI 都少一个会烂的依赖。
//!
//! 原生 `cargo test` 跳过本文件（`target_arch = "wasm32"` 门控）——
//! `JsValue` 在 wasm32 之外构造不出来。不依赖 JS 的那部分（引擎侧拿到
//! `Value::Array` 会不会溢出）在 `src/lib.rs` 的 `mod tests` 里用原生
//! registry 覆盖。

#![cfg(target_arch = "wasm32")]

use einfach_wasm::WasmWorkbook;
use wasm_bindgen::prelude::*;
use wasm_bindgen_test::*;

mod common;
use common::make_js_fn;

/// MYTAX(amount) returns `amount * 0.2`. End-to-end exercise of the
/// custom-formula path: registration → cell formula references it →
/// engine dispatches through `WorkbookEvalProvider::call_custom` →
/// `WasmCustomFormulaRegistry::lookup` → JS callback → marshaled return.
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_tax_round_trip() {
    let mut wb = WasmWorkbook::new();

    let tax = make_js_fn(|args| {
        let first = args.get(0);
        let amount = first.as_f64().unwrap_or(0.0);
        JsValue::from_f64(amount * 0.2)
    });
    wb.register_custom_formula("MYTAX".into(), tax);

    wb.set_number(0, "B1", 100.0);
    assert!(wb.set_formula(0, "C1", "=MYTAX(B1)"));

    assert_eq!(wb.get_number(0, "C1"), 20.0);
}

/// Lookup is case-insensitive. Register under upper case, reference
/// with mixed case in the formula.
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_case_insensitive() {
    let mut wb = WasmWorkbook::new();
    let identity = make_js_fn(|args| args.get(0));
    wb.register_custom_formula("MYECHO".into(), identity);

    assert!(wb.set_formula(0, "A1", "=myEcho(42)"));
    assert_eq!(wb.get_number(0, "A1"), 42.0);
}

/// `unregisterCustomFormula` makes subsequent reads surface `#NAME?`.
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_unregister_falls_back_to_name_error() {
    let mut wb = WasmWorkbook::new();
    let pi = make_js_fn(|_args| JsValue::from_f64(3.14));
    wb.register_custom_formula("MYPI".into(), pi);

    assert!(wb.set_formula(0, "A1", "=MYPI()"));
    assert_eq!(wb.get_number(0, "A1"), 3.14);

    assert!(wb.unregister_custom_formula("MYPI"));
    // After invalidation + re-eval, the cell now sees #NAME?.
    assert_eq!(wb.get_display(0, "A1"), "#NAME?");
}

/// A JS callback that throws surfaces `#VALUE!` in the cell. The wasm
/// instance stays alive — subsequent calls keep working.
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_throw_surfaces_value_error() {
    let mut wb = WasmWorkbook::new();
    let thrower = make_js_fn(|_args| {
        // Construct a JS Error and re-throw via wasm_bindgen's exception
        // path. We can't `throw` from Rust directly, but returning a
        // promise that rejects or using js_sys won't reach this code path
        // — instead we use wasm_bindgen::throw_str which converts to a
        // JS exception on the callback boundary.
        wasm_bindgen::throw_str("synthetic error")
    });
    wb.register_custom_formula("MYBOOM".into(), thrower);

    assert!(wb.set_formula(0, "A1", "=MYBOOM()"));
    assert_eq!(wb.get_display(0, "A1"), "#VALUE!");

    // Instance survives — set a number on another cell and read back.
    wb.set_number(0, "B1", 7.0);
    assert_eq!(wb.get_number(0, "B1"), 7.0);
}

/// Returning a string maps to a text cell; returning canonical error tokens
/// round-trips as the matching `ValueError`.
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_string_and_error_token_returns() {
    let mut wb = WasmWorkbook::new();

    let hello = make_js_fn(|_args| JsValue::from_str("hello"));
    wb.register_custom_formula("MYTXT".into(), hello);
    assert!(wb.set_formula(0, "A1", "=MYTXT()"));
    assert_eq!(wb.get_display(0, "A1"), "hello");

    let divzero = make_js_fn(|_args| JsValue::from_str("#DIV/0!"));
    wb.register_custom_formula("MYDIV".into(), divzero);
    assert!(wb.set_formula(0, "A2", "=MYDIV()"));
    assert_eq!(wb.get_display(0, "A2"), "#DIV/0!");

    let calc = make_js_fn(|_args| JsValue::from_str("#CALC!"));
    wb.register_custom_formula("MYCALC".into(), calc);
    assert!(wb.set_formula(0, "A3", "=MYCALC()"));
    assert_eq!(wb.get_display(0, "A3"), "#CALC!");

    let na = make_js_fn(|_args| JsValue::from_str("#N/A"));
    wb.register_custom_formula("MYNA".into(), na);
    assert!(wb.set_formula(0, "A4", "=MYNA()"));
    assert_eq!(wb.get_display(0, "A4"), "#N/A");

    let null = make_js_fn(|_args| JsValue::from_str("#NULL!"));
    wb.register_custom_formula("MYNULL".into(), null);
    assert!(wb.set_formula(0, "A5", "=MYNULL()"));
    assert_eq!(wb.get_display(0, "A5"), "#NULL!");
}

/// Re-registering an existing name replaces the callback AND dirties
/// dependent formulas so the next read reflects the new function.
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_re_register_replaces_callback() {
    let mut wb = WasmWorkbook::new();
    let plus_one = make_js_fn(|args| {
        let v = args.get(0).as_f64().unwrap_or(0.0);
        JsValue::from_f64(v + 1.0)
    });
    wb.register_custom_formula("MYOP".into(), plus_one);
    assert!(wb.set_formula(0, "A1", "=MYOP(10)"));
    assert_eq!(wb.get_number(0, "A1"), 11.0);

    let times_two = make_js_fn(|args| {
        let v = args.get(0).as_f64().unwrap_or(0.0);
        JsValue::from_f64(v * 2.0)
    });
    wb.register_custom_formula("MYOP".into(), times_two);
    // Cache was invalidated by the re-register call.
    assert_eq!(wb.get_number(0, "A1"), 20.0);
}

/// `customFormulaCount` reflects registration / unregistration.
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_count_probe() {
    let mut wb = WasmWorkbook::new();
    assert_eq!(wb.custom_formula_count(), 0);

    let noop = make_js_fn(|_args| JsValue::null());
    wb.register_custom_formula("ONE".into(), noop.clone());
    assert_eq!(wb.custom_formula_count(), 1);

    wb.register_custom_formula("TWO".into(), noop);
    assert_eq!(wb.custom_formula_count(), 2);

    assert!(wb.unregister_custom_formula("ONE"));
    assert_eq!(wb.custom_formula_count(), 1);

    // Idempotent unregister of a missing entry returns false.
    assert!(!wb.unregister_custom_formula("UNKNOWN"));
    assert_eq!(wb.custom_formula_count(), 1);
}
