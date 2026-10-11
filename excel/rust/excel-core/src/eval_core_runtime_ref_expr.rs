use super::*;

pub(super) fn runtime_ref_from_expr(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    match arg {
        Expr::Error(error) => Err(error.clone()),
        // 条件引用保留所选分支的地址，供 ROWS/SUM/INDEX 等原有消费者使用。
        Expr::FuncCall { name, args } if name == "IF" => {
            let branch = eval_fn_logical::selected_if_branch(args, provider)?
                .ok_or(ValueError::InvalidValue)?;
            runtime_ref_from_expr(branch, provider)
        }
        Expr::Name(name) if lookup_let_binding(name).is_none() => {
            if let Some((sheet, range)) = provider.lookup_named_range(name)? {
                return Ok(RuntimeRef {
                    sheet: Some(sheet),
                    range,
                    materialized: None,
                });
            }
            // 裸表名等同 Table[#Data]，仍使用同一个几何解析入口。
            // 未找到 Table 时保留 InvalidValue，让值求值继续查命名常量/LAMBDA。
            match resolve_table_ref(Some(name), TableArea::Data, None, provider) {
                Err(ValueError::InvalidName) => Err(ValueError::InvalidValue),
                result => result,
            }
        }
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

    let range = resolved.reference_range(area, columns, provider.current_cell())?;
    // 隐藏的表头没有单元格地址；Table epoch 保证重新显示后恢复真实表头值。
    let materialized = if area == TableArea::Headers && !resolved.has_headers {
        let len = checked_array_len(1, u64::from(range.cols()))?;
        Some(Arc::new(ArrayData::new(1, range.cols(), vec![Value::Number(0.0); len])))
    } else { None };

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
        materialized,
    })
}
