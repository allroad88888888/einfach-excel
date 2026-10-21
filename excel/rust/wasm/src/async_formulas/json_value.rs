// Explicit JSON-success values preserve text that resembles an Excel error token.
// This does not change the existing custom callback string/error return contract.

#[cfg(target_arch = "wasm32")]
fn json_formula_scalar(js: &JsValue, text_bytes: &mut usize) -> Option<Value> {
    if js.is_null() { return Some(Value::Null); }
    if let Some(number) = js.as_f64() {
        return number.is_finite().then_some(Value::Number(number));
    }
    if let Some(boolean) = js.as_bool() { return Some(Value::Boolean(boolean)); }
    if let Some(text) = js.as_string() {
        *text_bytes = text_bytes.checked_add(text.len())?;
        return (*text_bytes <= 1_048_576).then_some(Value::Text(text));
    }
    None
}

#[cfg(target_arch = "wasm32")]
fn json_formula_value(js: &JsValue) -> Value {
    let invalid = || Value::Error(ValueError::InvalidValue);
    let mut text_bytes = 0;
    if let Some(value) = json_formula_scalar(js, &mut text_bytes) { return value; }
    if !js_sys::Array::is_array(js) { return invalid(); }
    let rows = js.unchecked_ref::<js_sys::Array>();
    if rows.length() == 0 || rows.length() > 4_096 { return invalid(); }
    let first = rows.get(0);
    if !js_sys::Array::is_array(&first) { return invalid(); }
    let columns = first.unchecked_ref::<js_sys::Array>().length();
    let cells = u64::from(rows.length()) * u64::from(columns);
    if columns == 0 || cells > 4_096 { return invalid(); }
    let mut data = Vec::with_capacity(cells as usize);
    for row_index in 0..rows.length() {
        let row = rows.get(row_index);
        if !js_sys::Array::is_array(&row) { return invalid(); }
        let row = row.unchecked_ref::<js_sys::Array>();
        if row.length() != columns { return invalid(); }
        for column in 0..columns {
            let Some(value) = json_formula_scalar(&row.get(column), &mut text_bytes) else {
                return invalid();
            };
            data.push(value);
        }
    }
    Value::Array(Arc::new(einfach_core::ArrayData::new(rows.length(), columns, data)))
}

/// Only the explicit own `json` property opts in. Existing tagged errors win,
/// including objects carrying both fields, so previous callback contracts persist.
fn async_custom_settlement_value(js: &JsValue) -> Value {
    #[cfg(target_arch = "wasm32")]
    if js.is_object() && !js.is_null() {
        let error = js_sys::Reflect::get(js, &JsValue::from_str("error"))
            .ok().and_then(|value| value.as_string());
        if error.is_some() { return js_to_value(js); }
        if js.unchecked_ref::<js_sys::Object>().has_own_property(&JsValue::from_str("json")) {
            return js_sys::Reflect::get(js, &JsValue::from_str("json"))
                .map(|value| json_formula_value(&value))
                .unwrap_or(Value::Error(ValueError::InvalidValue));
        }
    }
    js_to_value(js)
}
