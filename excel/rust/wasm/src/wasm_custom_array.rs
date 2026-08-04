#[cfg(target_arch = "wasm32")]
fn js_array_to_value(outer: &js_sys::Array) -> Value {
    let rows = outer.length();
    if rows == 0 {
        return Value::Error(ValueError::Calc);
    }

    // 列数以第 0 行为准；其余行必须与之相等（矩形约束）。
    let first = outer.get(0);
    if !js_sys::Array::is_array(&first) {
        warn_custom_array(
            "callback returned a 1-D array; wrap it as [[a,b,c]] for a row or [[a],[b],[c]] for a column",
        );
        return Value::Error(ValueError::WrongType);
    }
    let cols = first.unchecked_ref::<js_sys::Array>().length();
    if cols == 0 {
        return Value::Error(ValueError::Calc);
    }

    // 先闸门后分配。
    let total = (rows as u64) * (cols as u64);
    if total > einfach_excel_core::DYNAMIC_ARRAY_CELL_CAP {
        warn_custom_array(&format!(
            "callback returned a {rows}x{cols} array ({total} cells) exceeding the {} cell cap; surfacing #VALUE!",
            einfach_excel_core::DYNAMIC_ARRAY_CELL_CAP
        ));
        return Value::Error(ValueError::InvalidValue);
    }

    let mut data: Vec<Value> = Vec::with_capacity(total as usize);
    for r in 0..rows {
        let row_js = outer.get(r);
        if !js_sys::Array::is_array(&row_js) {
            warn_custom_array(&format!(
                "callback returned a ragged array: row {r} is not an array; surfacing #VALUE!"
            ));
            return Value::Error(ValueError::WrongType);
        }
        let row = row_js.unchecked_ref::<js_sys::Array>();
        if row.length() != cols {
            warn_custom_array(&format!(
                "callback returned a ragged array: row {r} has {} cells, expected {cols}; surfacing #VALUE!",
                row.length()
            ));
            return Value::Error(ValueError::WrongType);
        }
        for c in 0..cols {
            let cell = js_to_value(&row.get(c));
            if matches!(cell, Value::Array(_)) {
                warn_custom_array(&format!(
                    "callback returned a nested array at ({r},{c}); cells must be scalars; surfacing #VALUE!"
                ));
                return Value::Error(ValueError::WrongType);
            }
            data.push(cell);
        }
    }

    Value::Array(Arc::new(einfach_core::ArrayData::new(rows, cols, data)))
}

/// 数组回程的诊断日志。单元格只承载一个 token，具体哪一行参差、超了多少，
/// 只能靠 worker devtools 看到 —— 与 `invoke_js_custom_formula` 里
/// 「回调 throw」的处理同一个思路。
#[cfg(target_arch = "wasm32")]
fn warn_custom_array(message: &str) {
    web_sys::console::warn_1(&JsValue::from_str(&format!(
        "[einfach custom formula] {message}"
    )));
}

/// Translate Excel-style error tokens back to `ValueError`. Used by both
/// the string return path (`return "#DIV/0!"`) and the tagged-object path
/// (`return { error: "#DIV/0!" }`). Unknown tokens return `None` so the
/// caller can decide whether to treat the string as text or `#VALUE!`.
fn error_token_to_value_error(s: &str) -> Option<ValueError> {
    match s {
        "#NULL!" => Some(ValueError::Null),
        "#DIV/0!" => Some(ValueError::DivisionByZero),
        "#N/A" => Some(ValueError::NotAvailable),
        "#REF!" => Some(ValueError::InvalidRef),
        "#VALUE!" => Some(ValueError::InvalidValue),
        "#NAME?" => Some(ValueError::InvalidName),
        "#NUM!" => Some(ValueError::Overflow),
        "#CYCLE!" => Some(ValueError::CyclicRef),
        "#TYPE!" => Some(ValueError::WrongType),
        "#ARGS!" => Some(ValueError::WrongArgCount),
        "#SPILL!" => Some(ValueError::Spill),
        "#CALC!" => Some(ValueError::Calc),
        "#BUSY!" => Some(ValueError::Busy),
        _ => None,
    }
}

/// `#BUSY!` is reserved for the engine's async-custom-formula pending state.
/// A callback that returns it (as `"#BUSY!"` or `{ error: "#BUSY!" }`) would
/// leave the cell permanently pending — the host would wait for a settle that
/// never comes — so the custom-return path demotes it to `#VALUE!` with a
/// console warning. Import / set_error paths keep accepting the token so
/// exported workbooks containing pending cells round-trip.
fn demote_busy_for_custom_return(err: ValueError) -> ValueError {
    if err == ValueError::Busy {
        #[cfg(target_arch = "wasm32")]
        {
            web_sys::console::warn_1(&JsValue::from_str(
                "[einfach custom formula] callbacks must not return #BUSY! (reserved for the async pending state); surfacing #VALUE!",
            ));
        }
        return ValueError::InvalidValue;
    }
    err
}

// Historical note: there used to be a `MAX_BULK_IMPORT_CELLS_PER_CALL`
// constant (750_000) and a matching `check_bulk_import_payload_size`
// pre-flight guard at the four bulk-import entry points. Both were
// installed because the pre-Phase-2 eager `Workbook::bulk_load` path
// allocated per-formula `FormulaRecord` + `cell_dependents` +
// `range_dependents` entries during import, which panicked the WASM
// linear-memory allocator at ~1M formula records. The Phase 2/3
// lazy-formula-indexing refactor (commits 40bc473 + 7d0e380) moved all
// of that work to first-read, so `bulk_load` now allocates only the
// formula source `Rc<str>` plus a `HashSet<CellAddress>` membership in
// `needs_parse`. Single-call payloads of 5M cells now complete cleanly
// at ~2.9 GB peak RSS. See `excel/rust/excel-core/docs/CAP_REMOVAL_2026-06-11.md`
// for the bench numbers and `excel/rust/excel-core/docs/LAZY_FORMULA_INDEXING_PLAN.md`
// §"Phase 5" for the broader arc.
