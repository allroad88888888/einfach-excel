//! 自定义公式**返回二维数组**（动态数组 / spill）的 wasm 契约测试。
//!
//! 与 `custom_formula_web.rs` 分开：那边盯的是注册生命周期和标量 / 错误
//! token 回程，这边只盯数组回程这一件事 —— 形状规则、元素类型、尺寸闸门、
//! 碰撞、以及异步结算走的是不是同一条 marshaling。
//!
//! 数组落地之后的投影 / 碰撞 / `#SPILL!` 全部复用引擎既有的 spill 路径
//! （ADR 0006），本文件断言的是「复用得对」，而不是另一套语义。
//!
//! 跑法：`wasm-pack test --node excel/rust/wasm`（刻意不绑浏览器，理由见
//! `custom_formula_web.rs` 顶部）。

#![cfg(target_arch = "wasm32")]

use einfach_wasm::WasmWorkbook;
use wasm_bindgen::prelude::*;
use wasm_bindgen_test::*;

mod common;
use common::make_js_fn;

/// 用一组 Rust 值拼出 JS 的一行（`js_sys::Array`）。数组回程测试全靠它。
fn js_row(cells: &[JsValue]) -> JsValue {
    let row = js_sys::Array::new();
    for c in cells {
        row.push(c);
    }
    row.into()
}

/// 把若干行拼成二维 JS 数组。
fn js_grid(rows: &[JsValue]) -> JsValue {
    let outer = js_sys::Array::new();
    for r in rows {
        outer.push(r);
    }
    outer.into()
}

/// 回程支持二维数组：`=MYGRID()` 返回 `[[1,2],[3,4]]` 应当溢出成 2×2。
/// 溢出本身走的是既有 spill 路径（ADR 0006），这里只验证结果。
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_returns_2d_array_and_spills() {
    let mut wb = WasmWorkbook::new();
    let grid = make_js_fn(|_args| {
        js_grid(&[
            js_row(&[JsValue::from_f64(1.0), JsValue::from_f64(2.0)]),
            js_row(&[JsValue::from_f64(3.0), JsValue::from_f64(4.0)]),
        ])
    });
    wb.register_custom_formula("MYGRID".into(), grid);
    assert!(wb.set_formula(0, "A1", "=MYGRID()"));

    // Anchor 投影成左上角标量，其余三格由 spill 目标提供。
    assert_eq!(wb.get_number(0, "A1"), 1.0);
    assert_eq!(wb.get_number(0, "B1"), 2.0);
    assert_eq!(wb.get_number(0, "A2"), 3.0);
    assert_eq!(wb.get_number(0, "B2"), 4.0);
    // 矩形之外没有被写脏。
    assert_eq!(wb.get_display(0, "C1"), "");
    assert_eq!(wb.get_display(0, "A3"), "");
}

/// 元素类型与入参方向对称：数字 / 文本 / 布尔 / null / 错误 token /
/// `{ error }` 在数组里与在标量返回值里含义完全一致（同一个 `js_to_value`）。
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_array_element_types_match_scalar_rules() {
    let mut wb = WasmWorkbook::new();
    let mixed = make_js_fn(|_args| {
        let tagged = js_sys::Object::new();
        let _ = js_sys::Reflect::set(
            &tagged,
            &JsValue::from_str("error"),
            &JsValue::from_str("#N/A"),
        );
        js_grid(&[
            js_row(&[JsValue::from_f64(1.5), JsValue::from_str("txt")]),
            js_row(&[JsValue::from_bool(true), JsValue::null()]),
            js_row(&[JsValue::from_str("#DIV/0!"), tagged.into()]),
        ])
    });
    wb.register_custom_formula("MYMIX".into(), mixed);
    assert!(wb.set_formula(0, "A1", "=MYMIX()"));

    assert_eq!(wb.get_number(0, "A1"), 1.5);
    assert_eq!(wb.get_display(0, "B1"), "txt");
    assert_eq!(wb.get_display(0, "A2"), "TRUE");
    assert_eq!(wb.get_display(0, "B2"), "");
    assert_eq!(wb.get_display(0, "A3"), "#DIV/0!");
    assert_eq!(wb.get_display(0, "B3"), "#N/A");
}

/// 形状规则：参差不齐 / 一维 / 三维一律拒绝（`#VALUE!`），绝不静默补空；
/// 空数组走 `#CALC!`（与 FILTER 空结果同一个答案）；1×1 是合法的最小数组。
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_array_return_shape_rules() {
    let mut wb = WasmWorkbook::new();

    // 参差不齐：第 1 行只有 1 格，第 0 行有 2 格。
    let ragged = make_js_fn(|_args| {
        js_grid(&[
            js_row(&[JsValue::from_f64(1.0), JsValue::from_f64(2.0)]),
            js_row(&[JsValue::from_f64(3.0)]),
        ])
    });
    wb.register_custom_formula("MYRAGGED".into(), ragged);
    assert!(wb.set_formula(0, "A1", "=MYRAGGED()"));
    assert_eq!(wb.get_display(0, "A1"), "#VALUE!");
    // 没有静默补空 —— 相邻格必须是空的，而不是 0 / 空串。
    assert_eq!(wb.get_display(0, "B1"), "");
    assert_eq!(wb.get_display(0, "A2"), "");

    // 一维：不替宿主猜行还是列。
    let flat = make_js_fn(|_args| {
        js_row(&[
            JsValue::from_f64(1.0),
            JsValue::from_f64(2.0),
            JsValue::from_f64(3.0),
        ])
    });
    wb.register_custom_formula("MYFLAT".into(), flat);
    assert!(wb.set_formula(0, "C1", "=MYFLAT()"));
    assert_eq!(wb.get_display(0, "C1"), "#VALUE!");

    // 三维：单元格里不能再套数组。
    let nested = make_js_fn(|_args| {
        js_grid(&[js_row(&[js_grid(&[js_row(&[JsValue::from_f64(1.0)])])])])
    });
    wb.register_custom_formula("MYNESTED".into(), nested);
    assert!(wb.set_formula(0, "D1", "=MYNESTED()"));
    assert_eq!(wb.get_display(0, "D1"), "#VALUE!");

    // `[]` 与 `[[]]` 都是零元素 → #CALC!
    let empty = make_js_fn(|_args| js_grid(&[]));
    wb.register_custom_formula("MYEMPTY".into(), empty);
    assert!(wb.set_formula(0, "E1", "=MYEMPTY()"));
    assert_eq!(wb.get_display(0, "E1"), "#CALC!");

    let empty_row = make_js_fn(|_args| js_grid(&[js_row(&[])]));
    wb.register_custom_formula("MYEMPTYROW".into(), empty_row);
    assert!(wb.set_formula(0, "F1", "=MYEMPTYROW()"));
    assert_eq!(wb.get_display(0, "F1"), "#CALC!");

    // 1×1 合法，与 `=SEQUENCE(1,1)` 同形。
    let single = make_js_fn(|_args| js_grid(&[js_row(&[JsValue::from_f64(42.0)])]));
    wb.register_custom_formula("MYONE".into(), single);
    assert!(wb.set_formula(0, "G1", "=MYONE()"));
    assert_eq!(wb.get_number(0, "G1"), 42.0);
    assert_eq!(wb.get_display(0, "H1"), "");
}

/// 尺寸闸门复用引擎的 `DYNAMIC_ARRAY_CELL_CAP`（1_048_576），
/// 且在**分配之前**就位：这里的 outer 只有 length 是大的（稀疏数组），
/// 若闸门跑在 materialize 之后，这个用例会先吃掉 GB 级内存。
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_array_return_respects_engine_cell_cap() {
    let mut wb = WasmWorkbook::new();
    let huge = make_js_fn(|_args| {
        let outer = js_sys::Array::new();
        outer.push(&js_row(&[JsValue::from_f64(1.0)]));
        // 1 列 × 2_000_000 行 > 1_048_576 格上限。
        outer.set_length(2_000_000);
        outer.into()
    });
    wb.register_custom_formula("MYHUGE".into(), huge);
    assert!(wb.set_formula(0, "A1", "=MYHUGE()"));
    assert_eq!(wb.get_display(0, "A1"), "#VALUE!");

    // 正好等于上限的一列是允许的（这里只验证闸门边界不是 off-by-one，
    // 用 1 列 × 1_048_576 行会真的分配，所以换成刚好超一格的形状来固定
    // 「>cap 才拒绝」的方向）。
    let over_by_one = make_js_fn(|_args| {
        let outer = js_sys::Array::new();
        outer.push(&js_row(&[JsValue::from_f64(1.0)]));
        outer.set_length(1_048_577);
        outer.into()
    });
    wb.register_custom_formula("MYOVER".into(), over_by_one);
    assert!(wb.set_formula(0, "B1", "=MYOVER()"));
    assert_eq!(wb.get_display(0, "B1"), "#VALUE!");
}

/// 碰撞走既有 `#SPILL!` 语义（ADR 0006）：目标格被占 → anchor 报 `#SPILL!`，
/// 清掉障碍物后数组自己活过来。自定义公式没有自己的一套碰撞规则。
#[wasm_bindgen_test]
fn wasm_workbook_custom_formula_array_return_uses_existing_spill_collision() {
    let mut wb = WasmWorkbook::new();
    let col = make_js_fn(|_args| {
        js_grid(&[
            js_row(&[JsValue::from_f64(1.0)]),
            js_row(&[JsValue::from_f64(2.0)]),
            js_row(&[JsValue::from_f64(3.0)]),
        ])
    });
    wb.register_custom_formula("MYCOL".into(), col);

    // A2 先被占住，A1 的 3×1 数组无处可落。
    wb.set_number(0, "A2", 99.0);
    assert!(wb.set_formula(0, "A1", "=MYCOL()"));
    assert_eq!(wb.get_display(0, "A1"), "#SPILL!");
    assert_eq!(wb.get_number(0, "A2"), 99.0);

    // 清掉障碍物 → 溢出自愈（ADR 0006 stage 2）。
    wb.clear_cell(0, "A2");
    assert_eq!(wb.get_number(0, "A1"), 1.0);
    assert_eq!(wb.get_number(0, "A2"), 2.0);
    assert_eq!(wb.get_number(0, "A3"), 3.0);
}

/// 异步回程走的是**同一条** `js_to_value`：`resolveAsyncCustomCall` 结算
/// 一个二维数组，同样溢出。没有「同步能返数组、异步不能」这种不一致。
#[wasm_bindgen_test]
fn wasm_workbook_async_custom_formula_settles_array_and_spills() {
    let mut wb = WasmWorkbook::new();
    wb.register_custom_formula_async("MYSLOWGRID".into());
    assert!(wb.set_formula(0, "A1", "=MYSLOWGRID()"));

    // 首读入队并显示 #BUSY!。
    assert_eq!(wb.get_display(0, "A1"), "#BUSY!");

    let pending = js_sys::Array::from(&wb.drain_async_custom_requests());
    assert_eq!(pending.length(), 1, "一次待结算调用");
    let call_id = js_sys::Reflect::get(&pending.get(0), &JsValue::from_str("callId"))
        .expect("callId 字段存在")
        .as_f64()
        .expect("callId 是数字");

    // 结算一个 2×2 数组 —— 与同步回调返回它走同一套 marshaling。
    let settled = js_grid(&[
        js_row(&[JsValue::from_f64(10.0), JsValue::from_f64(20.0)]),
        js_row(&[JsValue::from_f64(30.0), JsValue::from_f64(40.0)]),
    ]);
    assert!(wb.resolve_async_custom_call(call_id, settled));

    assert_eq!(wb.get_number(0, "A1"), 10.0);
    assert_eq!(wb.get_number(0, "B1"), 20.0);
    assert_eq!(wb.get_number(0, "A2"), 30.0);
    assert_eq!(wb.get_number(0, "B2"), 40.0);
}

