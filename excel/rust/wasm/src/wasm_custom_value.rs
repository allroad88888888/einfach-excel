fn value_to_js(value: &Value) -> JsValue {
    match value {
        Value::Number(n) => JsValue::from_f64(*n),
        Value::Text(s) => JsValue::from_str(s),
        Value::Boolean(b) => JsValue::from_bool(*b),
        Value::Null => JsValue::null(),
        Value::Error(e) => JsValue::from_str(&format!("{e}")),
        Value::Array(arr) => {
            let outer = js_sys::Array::new();
            for r in 0..arr.rows {
                let row = js_sys::Array::new();
                for c in 0..arr.cols {
                    let v = arr.get(r, c).cloned().unwrap_or(Value::Null);
                    row.push(&value_to_js(&v));
                }
                outer.push(&row);
            }
            outer.into()
        }
        Value::Lambda(_) => JsValue::null(),
    }
}

/// Marshal `JsValue` → `Value`. The JS callback may return any of:
///   - `number` → `Value::Number` (NaN / Infinity become `#NUM!`).
///   - `string` → `Value::Text`. The special tokens `"#NULL!"`,
///     `"#DIV/0!"`, `"#N/A"`, `"#REF!"`, `"#VALUE!"`, `"#NAME?"`,
///     `"#NUM!"`, `"#CYCLE!"`, `"#TYPE!"`, `"#ARGS!"`, `"#SPILL!"`,
///     `"#CALC!"` round-trip as the matching `ValueError` so a JS-side
///     custom function can deliberately propagate an Excel-style error.
///     `"#BUSY!"` is reserved for the async pending state and demotes to
///     `#VALUE!` (see `demote_busy_for_custom_return`).
///   - `boolean` → `Value::Boolean`.
///   - `null` / `undefined` → `Value::Null`.
///   - `{ error: string }` → `Value::Error(_)` parsed from the string
///     (same token map as above; unknown strings → `#VALUE!`).
///   - `Array` → `Value::Array` (二维、行主序)，交给既有 spill 路径去溢出。
///     形状与边界规则见 `js_array_to_value`。
///   - Anything else (Date, function, opaque object) →
///     `ValueError::WrongType`, which RENDERS as `#VALUE!`. Excel has no
///     `#TYPE!` code; the variant survives as an internal diagnostic and
///     `format::error_display_token` collapses it at every display
///     boundary. Same for a returned `"#TYPE!"` / `{ error: "#TYPE!" }`:
///     accepted by the token map, shown as `#VALUE!`. `"#ARGS!"` behaves
///     identically — accepted inbound, displayed as `#VALUE!`, because
///     Excel rejects a bad argument count at entry time and so has no cell
///     code for it either. `error_display_token` carries the registry.
fn js_to_value(js: &JsValue) -> Value {
    if js.is_null() || js.is_undefined() {
        return Value::Null;
    }
    if let Some(n) = js.as_f64() {
        if n.is_nan() || n.is_infinite() {
            return Value::Error(ValueError::Overflow);
        }
        return Value::Number(n);
    }
    if let Some(b) = js.as_bool() {
        return Value::Boolean(b);
    }
    if let Some(s) = js.as_string() {
        if let Some(err) = error_token_to_value_error(&s) {
            return Value::Error(demote_busy_for_custom_return(err));
        }
        // Hard cap on string size returned from a custom-formula
        // callback. A 1 GB string would be silently stored in the
        // formula cache and balloon worker memory before any user-
        // visible signal. 1 MB is generous for any legitimate Excel-
        // style text output (the longest sensible cell text is a few
        // KB); strings beyond this are almost certainly a misuse (e.g.
        // returning a serialized JSON blob into a cell). Surface
        // `#VALUE!` with a console warning so the host can debug.
        const MAX_CUSTOM_STRING_BYTES: usize = 1_048_576;
        if s.len() > MAX_CUSTOM_STRING_BYTES {
            #[cfg(target_arch = "wasm32")]
            {
                web_sys::console::warn_1(&JsValue::from_str(&format!(
                    "[einfach custom formula] return string of {} bytes exceeds {} byte cap; surfacing #VALUE!",
                    s.len(),
                    MAX_CUSTOM_STRING_BYTES
                )));
            }
            return Value::Error(ValueError::InvalidValue);
        }
        return Value::Text(s);
    }
    // 数组回程（动态数组 / spill）。必须排在 `is_object()` 之前 —— JS 里
    // Array 也是 object，落到下面那条分支就会被当成「不认识的对象」判成
    // `#TYPE!`，正是这个缺口让自定义公式一直没法返回可溢出的数组。
    #[cfg(target_arch = "wasm32")]
    if js_sys::Array::is_array(js) {
        return js_array_to_value(js.unchecked_ref::<js_sys::Array>());
    }
    // Tagged-error escape hatch: `{ error: "..." }`. Used so JS code can
    // return a structured value-or-error without picking between
    // overloading `return "#VALUE!"` (ambiguous if a user actually wants
    // the literal text `"#VALUE!"`) and throwing (which clears the
    // cell's eval frame).
    #[cfg(target_arch = "wasm32")]
    if js.is_object() {
        if let Ok(error_val) = js_sys::Reflect::get(js, &JsValue::from_str("error")) {
            if let Some(s) = error_val.as_string() {
                return Value::Error(demote_busy_for_custom_return(
                    error_token_to_value_error(&s).unwrap_or(ValueError::InvalidValue),
                ));
            }
        }
        // Plain object with no `error` key, or any other non-scalar JS
        // shape (Date, function, Promise) — surface `WrongType`, which the
        // cell renders as `#VALUE!`. The finer variant is kept so a
        // marshaling rejection stays distinguishable from a callback that
        // deliberately returned `#VALUE!` when you are reading engine
        // state. Arrays are NOT rejected here — they were peeled off above
        // by `js_array_to_value` and spill through the dynamic-array path.
        return Value::Error(ValueError::WrongType);
    }
    Value::Error(ValueError::WrongType)
}

// 自定义公式返回的 JS 数组 → `Value::Array`（二维、行主序），随后由既有
// spill 路径投影、碰撞检测、`#SPILL!`（ADR 0006），这里不碰溢出语义。
//
// 形状规则 —— 与**入参**方向严格对称（`value_to_js` 把 `Value::Array`
// marshal 成 `Array<Array<..>>`），所以回程也只认二维嵌套：
//
// - `[[1,2],[3,4]]` → 2×2。
// - `[1,2,3]`（一维）→ **拒绝**（`#TYPE!`/显示 `#VALUE!`）。不猜行还是列：
//   入参方向从不产生一维数组，这里替宿主猜一个方向就是第二套映射，
//   而且猜错要到渲染时才看得出来。warn 里直接给出两种写法。
// - 参差不齐（`[[1,2],[3]]`）→ **拒绝**，绝不静默补空。
// - `[]` / `[[]]`（零元素）→ `#CALC!`，与 `FILTER` 空结果同一个答案
//   （eval.rs § FILTER），不另立新错误码。
// - `[[5]]` → 1×1 数组，走 `=SEQUENCE(1,1)` 完全相同的路径（读取侧的
//   `collapse_array_for_scalar` 负责在标量上下文里塌回标量）。
//
// 元素类型不另写一套映射：每个元素递归回 `js_to_value`，所以数字 / 文本 /
// 布尔 / `null` / 错误 token / `{ error }` 与顶层完全一致（1 MB 字符串上限
// 也因此自动逐元素生效）。唯一的额外约束是**深度**：元素本身又是数组
// （`[[[1]]]`）说明嵌套超过二维，拒绝。
//
// 尺寸闸门复用引擎的 `DYNAMIC_ARRAY_CELL_CAP`（1_048_576 格，
// = Excel 最大行数），也就是 `SEQUENCE` / `MAKEARRAY` / `MMULT` 用的那一个；
// 超限返回 `#VALUE!`，与 `SEQUENCE` 超限的答案一致。闸门在**分配之前**
// 就位：只读 `length`，不 materialize，所以返回一百万行不会先撑爆 worker
// 内存再报错。
