use super::*;

pub(super) fn fn_formulatext(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    match &args[0] {
        Expr::CellRef(addr, _) => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            match provider.cell_formula_text(*addr) {
                Some(s) => Value::Text(s),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        Expr::Range { start, end, .. } => {
            let r = CellRange::new(*start, *end).normalize();
            match provider.cell_formula_text(r.start) {
                Some(s) => Value::Text(s),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        Expr::SheetRef { sheet, addr, .. } => {
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }
            if provider.sheet_index_of(sheet).is_none() {
                return Value::Error(ValueError::InvalidRef);
            }
            match provider.sheet_cell_formula_text(sheet, *addr) {
                Some(s) => Value::Text(s),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        Expr::SheetRange {
            sheet, start, end, ..
        } => {
            if provider.sheet_index_of(sheet).is_none() {
                return Value::Error(ValueError::InvalidRef);
            }
            let r = CellRange::new(*start, *end).normalize();
            match provider.sheet_cell_formula_text(sheet, r.start) {
                Some(s) => Value::Text(s),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        _ => Value::Error(ValueError::WrongType),
    }
}
