fn workbook_error_to_js(err: WorkbookError) -> JsValue {
    let msg = match err {
        WorkbookError::ReservedName => "reserved-name".to_string(),
        WorkbookError::InvalidName => "invalid-name".to_string(),
        WorkbookError::ParseFailed => "parse-failed".to_string(),
        WorkbookError::EvalFailed(e) => format!("eval-failed: {}", e),
        WorkbookError::MutationDuringCustomCall => "mutation-during-custom-call".to_string(),
        // #32 Excel Table T1: defined-name/Table shared-namespace conflict.
        // Non-export compile-fix for the new `WorkbookError` variant — this
        // internal error-formatting helper is not part of the wasm export
        // surface, so no snapshot regeneration is needed.
        WorkbookError::NameConflict => "name-conflict".to_string(),
    };
    JsValue::from_str(&msg)
}

/// Build the `{ ok: false, code, anchor?, message? }` rejection object for
/// `sortRange`. Mirrors `sheet_error_to_js` so the JS side matches on `code`
/// rather than parsing a message string.
fn sort_error_to_js(code: &str, anchor: Option<&str>, message: Option<&str>) -> JsValue {
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &JsValue::from_str("ok"), &JsValue::FALSE).ok();
    js_sys::Reflect::set(&obj, &JsValue::from_str("code"), &JsValue::from_str(code)).ok();
    if let Some(anchor) = anchor {
        js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("anchor"),
            &JsValue::from_str(anchor),
        )
        .ok();
    }
    if let Some(message) = message {
        js_sys::Reflect::set(
            &obj,
            &JsValue::from_str("message"),
            &JsValue::from_str(message),
        )
        .ok();
    }
    obj.into()
}

/// Map a `SortRangeError` to the structured `sortRange` rejection object.
/// Codes are kebab-case, matching the `sheet_error_to_js` family; the
/// spill rejection carries its anchor address.
fn sort_range_error_to_js(err: SortRangeError) -> JsValue {
    match err {
        SortRangeError::InvalidRange => sort_error_to_js("invalid-range", None, None),
        SortRangeError::EmptyKeys => sort_error_to_js("empty-keys", None, None),
        SortRangeError::KeyOutOfRange => sort_error_to_js("key-out-of-range", None, None),
        SortRangeError::SpillIntersectsRange { anchor } => {
            sort_error_to_js("spill-in-range", Some(&anchor.to_string()), None)
        }
    }
}

// Collapse a spill-anchor `Value::Array` to its top-left scalar before
// crossing into JS. The JS layer never observes the `Array` variant —
// spilled cells already return scalars through their derived atoms, and
// the anchor cell renders the [0][0] element exactly like Excel does
// when copying an array-formula anchor. This is the Phase 1 boundary
