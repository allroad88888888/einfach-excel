use super::*;

pub(super) fn fn_isformula(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    match &args[0] {
        Expr::CellRef(addr, _) => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            Value::Boolean(provider.cell_has_formula(*addr))
        }
        Expr::Range { start, end, .. } => {
            let r = CellRange::new(*start, *end).normalize();
            Value::Boolean(provider.cell_has_formula(r.start))
        }
        Expr::SheetRef { sheet, addr, .. } => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            if provider.sheet_index_of(sheet).is_none() {
                return Value::Error(ValueError::InvalidRef);
            }
            Value::Boolean(provider.sheet_cell_has_formula(sheet, *addr))
        }
        Expr::SheetRange {
            sheet, start, end, ..
        } => {
            if provider.sheet_index_of(sheet).is_none() {
                return Value::Error(ValueError::InvalidRef);
            }
            let r = CellRange::new(*start, *end).normalize();
            Value::Boolean(provider.sheet_cell_has_formula(sheet, r.start))
        }
        _ => Value::Error(ValueError::InvalidValue),
    }
}

pub(super) fn fn_sheet(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() > 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    if args.is_empty() {
        match provider.current_sheet_index() {
            Some(idx) => Value::Number((idx + 1) as f64),
            None => Value::Error(ValueError::InvalidRef),
        }
    } else {
        match &args[0] {
            // Same-sheet ref → current sheet (Excel parity).
            Expr::CellRef(..) | Expr::Range { .. } => match provider.current_sheet_index() {
                Some(idx) => Value::Number((idx + 1) as f64),
                None => Value::Error(ValueError::InvalidRef),
            },
            Expr::SheetRef { sheet, .. } | Expr::SheetRange { sheet, .. } => {
                match provider.sheet_index_of(sheet) {
                    Some(idx) => Value::Number((idx + 1) as f64),
                    None => Value::Error(ValueError::InvalidRef),
                }
            }
            _ => Value::Error(ValueError::InvalidValue),
        }
    }
}

pub(super) fn fn_sheets(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() > 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    if args.is_empty() {
        Value::Number(provider.sheet_count() as f64)
    } else {
        match &args[0] {
            Expr::CellRef(..)
            | Expr::Range { .. }
            | Expr::SheetRef { .. }
            | Expr::SheetRange { .. } => Value::Number(1.0),
            _ => Value::Error(ValueError::InvalidValue),
        }
    }
}

pub(super) fn fn_info(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let key = coerce_to_text(&v).to_ascii_lowercase();
    match key.as_str() {
        "directory" => Value::Text(String::new()),
        "numfile" => Value::Number(1.0),
        "osversion" => Value::Text(String::new()),
        "recalc" => Value::Text("Automatic".into()),
        "release" => Value::Text(format!("einfach-{}", env!("CARGO_PKG_VERSION"))),
        "system" => {
            let os = if cfg!(target_os = "macos") {
                "mac"
            } else if cfg!(target_os = "windows") {
                "pc"
            } else {
                "other"
            };
            Value::Text(os.into())
        }
        _ => Value::Error(ValueError::InvalidValue),
    }
}
