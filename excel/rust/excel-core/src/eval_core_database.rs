use super::*;

/// A database range resolved from a D* function's first argument. The
/// header row is data row 0 in the original rectangle; `data_rows` is the
/// number of rows BELOW the header. Built from `arg_as_range`/`OFFSET`
/// shapes (the same set `resolve_range_arg` accepts) but kept separately
/// so callers can address "data row i, column j" without subtracting the
/// header offset each time.
pub(super) struct DatabaseRange {
    pub(super) sheet: Option<String>,
    pub(super) start_row: u32,
    pub(super) start_col: u32,
    pub(super) cols: u32,
    pub(super) data_rows: u32,
}

impl DatabaseRange {
    /// Fetch the header cell at the given 0-based column index. Returns
    /// `Value::Null` if `col` is out of range.
    pub(super) fn header(&self, col: u32, provider: &dyn EvalProvider) -> Value {
        if col >= self.cols {
            return Value::Null;
        }
        let addr = CellAddress::new(self.start_row, self.start_col + col);
        match &self.sheet {
            Some(s) => provider.sheet_cell(s, addr),
            None => provider.cell(addr),
        }
    }

    /// Fetch a data cell. `row` is 0-based against the data area (so row
    /// 0 is the first row after the header), and `col` is the 0-based
    /// column index.
    pub(super) fn data_cell(&self, row: u32, col: u32, provider: &dyn EvalProvider) -> Value {
        let addr = CellAddress::new(self.start_row + 1 + row, self.start_col + col);
        match &self.sheet {
            Some(s) => provider.sheet_cell(s, addr),
            None => provider.cell(addr),
        }
    }
}

/// Resolve a D* function's database argument into a `DatabaseRange`. The
/// argument must be a literal range or `OFFSET(...)` with at least 2 rows
/// (header + ≥ 1 data row). Otherwise `InvalidValue`.
pub(super) fn resolve_database_range(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<DatabaseRange, ValueError> {
    let resolved = resolve_range_arg(arg, provider)?.ok_or(ValueError::InvalidValue)?;
    if resolved.rows < 2 {
        // A database needs a header row and at least one data row.
        return Err(ValueError::InvalidValue);
    }
    Ok(DatabaseRange {
        sheet: resolved.sheet,
        start_row: resolved.start_row,
        start_col: resolved.start_col,
        cols: resolved.cols,
        data_rows: resolved.rows - 1,
    })
}

/// Resolve a D* function's `field` argument to a 0-based column index
/// inside `database`. Accepts:
/// - A 1-based number (1 → column 0, etc).
/// - Text matching a header cell case-insensitively.
/// Anything else, or out-of-range, is `InvalidValue`. Header cells that
/// evaluate to `Value::Error(_)` propagate.
pub(super) fn resolve_db_field(
    database: &DatabaseRange,
    field_arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<usize, ValueError> {
    let v = eval_expr_with_provider(field_arg, provider);
    if let Value::Error(e) = v {
        return Err(e);
    }
    // Numeric form first: 1-based column index. Booleans coerce per
    // `coerce_to_number` (TRUE=1, FALSE=0); FALSE → out of range.
    if let Value::Number(n) = v {
        if !n.is_finite() || n.trunc() != n || n < 1.0 || (n as u32) > database.cols {
            return Err(ValueError::InvalidValue);
        }
        return Ok((n as usize) - 1);
    }
    // Text form: case-insensitive header lookup.
    let needle = match v {
        Value::Text(s) => s,
        _ => return Err(ValueError::InvalidValue),
    };
    let needle_lc = needle.to_lowercase();
    for col in 0..database.cols {
        let header = database.header(col, provider);
        if let Value::Error(e) = header {
            return Err(e);
        }
        if coerce_to_text(&header).to_lowercase() == needle_lc {
            return Ok(col as usize);
        }
    }
    Err(ValueError::InvalidValue)
}

/// Walk every data row of `database`, evaluate `criteria`, and invoke
/// `callback(row_index)` for each matching row.
///
/// Criteria layout: row 0 is a header row whose cells name database
/// columns (case-insensitive). Rows 1..N are criterion rows. A data row
/// matches if it satisfies AT LEAST ONE criterion row; a criterion row
/// is satisfied if EVERY non-empty cell in it passes `matches_criterion`
/// against the corresponding database column. Empty (Null) criterion
/// cells contribute nothing (vacuously true), so a fully empty criterion
/// row matches every data row.
///
/// Returns `Err(e)` on the first `Value::Error(_)` encountered in either
/// database or criteria cells, or on a malformed criteria range (no
/// header row, or a header that doesn't match any database column).
pub(super) fn iter_db_matches(
    database: &DatabaseRange,
    criteria_arg: &Expr,
    provider: &dyn EvalProvider,
    mut callback: impl FnMut(u32) -> Result<(), ValueError>,
) -> Result<(), ValueError> {
    let criteria = resolve_range_arg(criteria_arg, provider)?.ok_or(ValueError::InvalidValue)?;
    if criteria.rows < 2 {
        // No criterion rows — Excel treats this as "no rows match".
        return Ok(());
    }

    // Resolve criteria headers → database column index (lazily, once).
    // `header_cols[i]` is the 0-based database column for criteria column
    // `i`, or `None` if the criteria header is empty (skip column).
    let mut header_cols: Vec<Option<u32>> = Vec::with_capacity(criteria.cols as usize);
    for c in 0..criteria.cols {
        let header = fetch_range_cell(&criteria, 0, c, provider);
        if let Value::Error(e) = header {
            return Err(e);
        }
        if matches!(header, Value::Null) {
            header_cols.push(None);
            continue;
        }
        let header_text = coerce_to_text(&header).to_lowercase();
        let mut matched: Option<u32> = None;
        for db_c in 0..database.cols {
            let dh = database.header(db_c, provider);
            if let Value::Error(e) = dh {
                return Err(e);
            }
            if coerce_to_text(&dh).to_lowercase() == header_text {
                matched = Some(db_c);
                break;
            }
        }
        // Bad criteria header (non-empty header not present in database)
        // → InvalidValue. We choose strict-error semantics over silent
        // mismatch so authoring mistakes surface loudly.
        match matched {
            Some(idx) => header_cols.push(Some(idx)),
            None => return Err(ValueError::InvalidValue),
        }
    }

    // For each data row, OR across criterion rows.
    for dr in 0..database.data_rows {
        let mut any_row_matches = false;
        for cr in 1..criteria.rows {
            let mut all_match = true;
            for cc in 0..criteria.cols {
                let cv = fetch_range_cell(&criteria, cr, cc, provider);
                if let Value::Error(e) = cv {
                    return Err(e);
                }
                if matches!(cv, Value::Null) {
                    continue;
                }
                let db_col = match header_cols[cc as usize] {
                    Some(c) => c,
                    // Skipped column (criteria header was empty). The
                    // criterion value here is non-empty but has no
                    // anchor column → vacuously fail this criterion row.
                    None => {
                        all_match = false;
                        break;
                    }
                };
                let dv = database.data_cell(dr, db_col, provider);
                if let Value::Error(e) = dv {
                    return Err(e);
                }
                if !matches_criterion(&dv, &cv) {
                    all_match = false;
                    break;
                }
            }
            if all_match {
                any_row_matches = true;
                break;
            }
        }
        if any_row_matches {
            callback(dr)?;
        }
    }
    Ok(())
}

/// Common skeleton for D* numeric aggregates. Resolves the database and
/// field column, then folds over matching rows' `field` values through
/// `step`. `init` seeds the accumulator; `finalize` produces the result
/// (e.g. wrap in `Value::Number`, or surface `DivisionByZero` if no
/// values were collected).
///
/// `step` receives `(state, value)` and may inspect non-numeric values
/// (DCOUNTA cares about Null vs non-Null) — callers gate by type.
pub(super) fn db_aggregate<S>(
    args: &[Expr],
    provider: &dyn EvalProvider,
    mut init: S,
    step: impl Fn(&mut S, &Value),
    finalize: impl FnOnce(S) -> Value,
) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let database = match resolve_database_range(&args[0], provider) {
        Ok(d) => d,
        Err(e) => return Value::Error(e),
    };
    let field_col = match resolve_db_field(&database, &args[1], provider) {
        Ok(c) => c,
        Err(e) => return Value::Error(e),
    };
    let walk = iter_db_matches(&database, &args[2], provider, |row| {
        let v = database.data_cell(row, field_col as u32, provider);
        if let Value::Error(e) = v {
            return Err(e);
        }
        step(&mut init, &v);
        Ok(())
    });
    if let Err(e) = walk {
        return Value::Error(e);
    }
    finalize(init)
}
