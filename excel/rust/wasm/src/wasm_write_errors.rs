/// Convert a `Result<(), SheetError>` from a workbook try-set into the
/// `{ ok, code?, anchor? }` JS object shape used by the WASM-facing
/// `trySetCell*` exports.
fn try_set_cell_result(result: Result<(), SheetError>) -> Result<JsValue, JsValue> {
    match result {
        Ok(()) => {
            let obj = js_sys::Object::new();
            js_sys::Reflect::set(&obj, &JsValue::from_str("ok"), &JsValue::TRUE).ok();
            Ok(obj.into())
        }
        Err(err) => Ok(sheet_error_to_js(err)),
    }
}

/// Serialize a `SheetError` to the JS-facing `{ ok: false, code, anchor? }`
/// object so callers can match on `code` rather than parsing a message
/// string. The `anchor` field is only present for `SpillCellWrite`.
fn sheet_error_to_js(err: SheetError) -> JsValue {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("ok"), &JsValue::FALSE).ok();
    match err {
        SheetError::SpillCellWrite { anchor } => {
            js_sys::Reflect::set(
                &obj,
                &JsValue::from_str("code"),
                &JsValue::from_str("spill-write"),
            )
            .ok();
            js_sys::Reflect::set(
                &obj,
                &JsValue::from_str("anchor"),
                &JsValue::from_str(&anchor.to_string()),
            )
            .ok();
        }
        SheetError::InvalidAddress => {
            js_sys::Reflect::set(
                &obj,
                &JsValue::from_str("code"),
                &JsValue::from_str("invalid-address"),
            )
            .ok();
        }
        SheetError::MutationDuringCustomCall => {
            // Wave 8 codex-review fix #1. Host code attempted to write
            // through the workbook from inside a custom-formula JS
            // callback. See `CUSTOM_FORMULAS.md` § "No mutations during
            // callback" for the contract.
            js_sys::Reflect::set(
                &obj,
                &JsValue::from_str("code"),
                &JsValue::from_str("mutation-during-custom-call"),
            )
            .ok();
        }
    }
    obj.into()
}

// Map a `WorkbookError` to a JS-side string code the caller can match
// on. Plain strings (not the structured object that `sheet_error_to_js`
// returns) because `defineName` / `undefineName` are infallible-by-
// design from the host's perspective: the error space is small,
// deterministic, and reported synchronously, so a tag is enough.
//
// The eval-failed variant includes the wrapped `ValueError`'s display
// form (`"eval-failed: #DIV/0!"`) so the host can show the cell-style
