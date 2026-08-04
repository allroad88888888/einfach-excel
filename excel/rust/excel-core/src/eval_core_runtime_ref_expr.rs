use super::*;

pub(super) fn runtime_ref_from_expr(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    match arg {
        Expr::CellRef(addr, _) => Ok(RuntimeRef {
            sheet: None,
            range: CellRange::single(*addr),
            materialized: None,
        }),
        Expr::Range { start, end, .. } => Ok(RuntimeRef {
            sheet: None,
            range: CellRange::new(*start, *end),
            materialized: None,
        }),
        Expr::SheetRef { sheet, addr, .. } => Ok(RuntimeRef {
            sheet: Some(sheet.clone()),
            range: CellRange::single(*addr),
            materialized: None,
        }),
        Expr::SheetRange {
            sheet, start, end, ..
        } => Ok(RuntimeRef {
            sheet: Some(sheet.clone()),
            range: CellRange::new(*start, *end),
            materialized: None,
        }),
        Expr::SpillRef(anchor) => runtime_ref_from_spill(anchor, provider),
        Expr::DynamicRange { start, end } => {
            let start_ref = top_left_runtime_ref(runtime_ref_from_expr(start, provider)?);
            let end_ref = top_left_runtime_ref(runtime_ref_from_expr(end, provider)?);
            if start_ref.sheet != end_ref.sheet {
                return Err(ValueError::InvalidValue);
            }
            Ok(RuntimeRef {
                sheet: start_ref.sheet,
                range: CellRange::new(start_ref.range.start, end_ref.range.start),
                materialized: None,
            })
        }
        Expr::FuncCall { name, args } if name == "OFFSET" => {
            eval_offset_as_range(args, provider).ok_or(ValueError::InvalidRef)
        }
        Expr::FuncCall { name, args } if name == "INDIRECT" => {
            runtime_ref_from_indirect(args, provider)
        }
        Expr::FuncCall { name, args } if name == "INDEX" => runtime_ref_from_index(args, provider),
        Expr::TableRef {
            table,
            area,
            columns,
        } => resolve_table_ref(table.as_deref(), *area, columns.as_ref(), provider),
        _ => Err(ValueError::InvalidValue),
    }
}

/// Resolve an `Expr::TableRef` to a concrete runtime range (design doc #32
/// §5.3, "delayed resolution + delegate"). The single funnel every
/// consumer routes through — value context (`runtime_ref_to_value`),
/// aggregate streaming (`for_each_arg_value`), 2-D collection
/// (`collect_range_2d_for_arg`), and binop broadcast
/// (`eval_operand_for_binop`) all reach a structured reference via
/// `runtime_ref_from_expr`, so no parallel read path exists. Dependency
/// edges register through the provider's facade reads exactly as for a
/// typed range.
pub(super) fn resolve_table_ref(
    table: Option<&str>,
    area: TableArea,
    columns: Option<&(String, String)>,
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    let Some(resolved) = provider.lookup_table(table) else {
        // Named table not in the registry → `#NAME?` (unknown name, Excel
        // parity). A table-less `[Col]` / `[@Col]` whose current cell is
        // not inside any Table → `#VALUE!`.
        return Err(match table {
            Some(_) => ValueError::InvalidName,
            None => ValueError::InvalidValue,
        });
    };

    let full = resolved.range.normalize();
    let header_rows: u32 = if resolved.has_headers { 1 } else { 0 };
    let totals_rows: u32 = if resolved.has_totals { 1 } else { 0 };
    let data_start = full.start.row + header_rows;
    let data_end = full
        .end
        .row
        .checked_sub(totals_rows)
        .unwrap_or(full.start.row);

    let (row_start, row_end) = match area {
        TableArea::All => (full.start.row, full.end.row),
        TableArea::Headers => {
            if !resolved.has_headers {
                return Err(ValueError::InvalidRef);
            }
            (full.start.row, full.start.row)
        }
        TableArea::Totals => {
            if !resolved.has_totals {
                return Err(ValueError::InvalidRef);
            }
            (full.end.row, full.end.row)
        }
        TableArea::Data => {
            if data_end < data_start {
                // Zero data rows → `#REF!` (design §4.1 known divergence
                // from Excel's "keep one empty data row").
                return Err(ValueError::InvalidRef);
            }
            (data_start, data_end)
        }
        TableArea::ThisRow => {
            let cur = provider.current_cell().ok_or(ValueError::InvalidValue)?;
            if data_end < data_start || cur.row < data_start || cur.row > data_end {
                // Current row outside the data area (or no current cell) →
                // `#VALUE!` (design §5.3 point 2, Excel parity).
                return Err(ValueError::InvalidValue);
            }
            (cur.row, cur.row)
        }
    };

    let (col_start, col_end) = match columns {
        None => (full.start.col, full.end.col),
        Some((a, b)) => {
            let ia = find_table_column(&resolved.columns, a).ok_or(ValueError::InvalidRef)?;
            let ib = find_table_column(&resolved.columns, b).ok_or(ValueError::InvalidRef)?;
            let ca = full.start.col + ia;
            let cb = full.start.col + ib;
            (ca.min(cb), ca.max(cb))
        }
    };

    let range = CellRange::new(
        CellAddress::new(row_start, col_start),
        CellAddress::new(row_end, col_end),
    );

    // Same-sheet Tables resolve as a bare (`sheet: None`) range so the
    // dependency edges are byte-for-byte identical to a typed `A1:A10`;
    // cross-sheet Tables carry the anchor sheet name so reads route through
    // the cross-sheet facade path (design §5.3 point 4).
    let sheet = if provider.current_sheet_index() == Some(resolved.sheet_index) {
        None
    } else {
        Some(resolved.sheet_name)
    };

    Ok(RuntimeRef {
        sheet,
        range,
        materialized: None,
    })
}

/// Case-insensitive column-name lookup → 0-based offset within a Table's
/// column list. `None` when the name isn't a column (→ `#REF!`).
pub(super) fn find_table_column(columns: &[String], name: &str) -> Option<u32> {
    columns
        .iter()
        .position(|c| c.eq_ignore_ascii_case(name))
        .map(|i| i as u32)
}
