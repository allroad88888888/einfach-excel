fn invoke_js_custom_formula(callback: &js_sys::Function, args: &[Value]) -> Value {
    let js_args = js_sys::Array::new();
    for v in args {
        js_args.push(&value_to_js(v));
    }
    match callback.call1(&JsValue::undefined(), &js_args) {
        Ok(ret) => js_to_value(&ret),
        Err(err) => {
            // The JS callback threw. `ValueError` is a flat enum with no
            // string payload, so we can't carry the message into the
            // cell value — but we can surface it via `console.warn` so a
            // host devtools inspection shows the actual JS message
            // alongside the `#VALUE!` cell. The browser's default error
            // logging swallows thrown exceptions caught here, so without
            // this `warn_1` the user sees `#VALUE!` with zero context.
            let message = extract_js_error_message(&err);
            #[cfg(target_arch = "wasm32")]
            {
                web_sys::console::warn_1(&JsValue::from_str(&format!(
                    "[einfach custom formula] callback threw: {message}"
                )));
            }
            #[cfg(not(target_arch = "wasm32"))]
            {
                let _ = message; // native build: no console, drop the string
            }
            Value::Error(ValueError::InvalidValue)
        }
    }
}

/// Best-effort string extraction from a thrown JS value. JS code can
/// `throw` any value — an Error, a string, a number, an object — so we
/// try a few shapes in priority order:
///
/// 1. `js_sys::Error::message()` for proper Error instances (the common
///    case: `throw new Error("oops")`).
/// 2. `JsValue::as_string()` for plain string throws (`throw "oops"`).
/// 3. The `Debug` format for everything else.
///
/// Returned as an owned `String` so the caller can include it in a log
/// line without juggling lifetimes.
fn extract_js_error_message(err: &JsValue) -> String {
    if let Some(error) = err.dyn_ref::<js_sys::Error>() {
        if let Some(msg) = error.message().as_string() {
            return msg;
        }
    }
    if let Some(s) = err.as_string() {
        return s;
    }
    format!("{:?}", err)
}

// Marshal `Value` → `JsValue`. Scalars round-trip via their natural JS
// types; `Value::Array` becomes a 2-D `Array<Array<...>>`; `Value::Error`
// becomes a plain string like `"#DIV/0!"` so the JS side has at least
// some signal. `Value::Lambda` (which can't reach here in practice — the
