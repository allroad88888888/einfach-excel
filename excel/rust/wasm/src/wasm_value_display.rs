fn collapse_array_for_js(val: &Value) -> std::borrow::Cow<'_, Value> {
    match val {
        Value::Array(arr) => std::borrow::Cow::Owned(arr.get(0, 0).cloned().unwrap_or(Value::Null)),
        _ => std::borrow::Cow::Borrowed(val),
    }
}

/// Delegates to `einfach_excel_core::value_to_display`.
///
/// The body used to live here. E3 moved it into the engine and left this
/// one-liner behind on purpose: `Workbook::apply_filter` has to compare its
/// predicate against the SAME string this boundary emits, because that
/// string is what the host's TypeScript predicate
/// (`excel/solid-excel/src-vnext/adapter/filter-predicate.ts`) reads today over
/// `readSparseRange`. Two separately-maintained formatters would have been
/// a silent drift channel between the two engines; delegation makes them
/// the same function, not merely the same intent.
fn value_to_display(val: &Value) -> String {
    einfach_excel_core::value_to_display(val)
}

fn value_to_cell_type(val: &Value) -> String {
    let val = collapse_array_for_js(val);
    match &*val {
        Value::Number(_) => "number",
        Value::Text(_) => "text",
        Value::Boolean(_) => "boolean",
        Value::Null => "null",
        Value::Error(_) => "error",
        // Unreachable: collapsed above.
        Value::Array(_) => "null",
        // Lambda is not a persistable cell type — surface as "null".
        Value::Lambda(_) => "null",
    }
    .into()
}

fn sparse_cell_from_value(sheet: usize, addr: CellAddress, val: &Value) -> Option<SparseCellJSON> {
    let val = collapse_array_for_js(val);
    let (kind, value) = match &*val {
        Value::Number(n) => ("number", Some(ImportValueJSON::Number(*n))),
        Value::Text(s) => ("text", Some(ImportValueJSON::Text(s.clone()))),
        Value::Boolean(b) => ("boolean", Some(ImportValueJSON::Boolean(*b))),
        // `Display`, NOT `error_display_token`. This record is the
        // persistence / clipboard WIRE, and `value_error_from_display` is its
        // exact inverse — a snapshot must restore the variant it captured, so
        // it has to speak the serialization vocabulary (where `WrongType` is
        // still `#TYPE!`), not the narrower Excel-facing display one.
        Value::Error(e) => ("error", Some(ImportValueJSON::Text(format!("{}", e)))),
        Value::Null => return None,
        // Unreachable: collapsed above.
        Value::Array(_) => return None,
        // Lambdas don't make it into the sparse-cell export.
        Value::Lambda(_) => return None,
    };
    Some(SparseCellJSON {
        sheet,
        addr: addr.to_string(),
        row: addr.row,
        col: addr.col,
        kind: kind.into(),
        value,
    })
}

fn sparse_cell_from_sheet_no_eval(
    sheet_idx: usize,
    sheet: &Sheet,
    addr: CellAddress,
) -> Option<SparseCellJSON> {
    let addr_str = addr.to_string();
    if let Some(formula) = sheet.get_formula(&addr_str) {
        return Some(SparseCellJSON {
            sheet: sheet_idx,
            addr: addr_str,
            row: addr.row,
            col: addr.col,
            kind: "formula".into(),
            value: Some(ImportValueJSON::Text(formula)),
        });
    }

    // A non-anchor spill target is a VIEW of its anchor's array, not
    // worksheet content: `cells` parks a derived atom there whose value
    // reads the anchor and indexes into it (see `Sheet::register_spill`).
    // Serializing that view as a `kind:"number"` literal turns it into a
    // fact, and every consumer of these records re-materializes it as a
    // real cell — which then OCCUPIES the address the anchor needs, so the
    // anchor's next spill attempt answers `Err(ValueError::Spill)` and the
    // formula's own value is replaced by `#SPILL!`. That is the whole of
    // the `snapshot_persistence_v1` → `restore_persistence_v1` regression:
    // ten records went out for `=SEQUENCE(10)`, nine literals landed
    // first, and the anchor could no longer spill into its own region.
    //
    // The anchor needs no special case — it is a formula cell and returned
    // above — and it is the only record a restore needs, because the
    // projection is re-derived from it (eagerly by
    // `install_bulk_spill_projections` on a bulk install, by
    // `recompute_array_formula` on a write). Skipping the targets is also
    // what makes the restored region a LIVE projection instead of a frozen
    // copy: literals would keep displaying the right numbers until the
    // next anchor edit, which is exactly why this defect stayed latent.
    //
    // The TS reference runtime has always excluded them
    // (`worker-runtime-ts.ts` § `snapshotRangeSparse`); this closes the
    // asymmetry rather than inventing a new rule.
    if sheet.is_spilled(addr) {
        return None;
    }

    sparse_cell_from_value(sheet_idx, addr, &sheet.peek_value(addr))
}

fn value_error_from_display(value: &str) -> ValueError {
    error_token_to_value_error(value).unwrap_or(ValueError::InvalidValue)
}
