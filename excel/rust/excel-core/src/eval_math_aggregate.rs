use super::*;

enum SumproductArg {
    Dense {
        rows: u32,
        cols: u32,
        data: Vec<Value>,
    },
    Sparse {
        reference: RuntimeRef,
        rows: u32,
        cols: u32,
    },
}

impl SumproductArg {
    fn from_expr(arg: &Expr, provider: &dyn EvalProvider) -> Result<Self, ValueError> {
        match runtime_ref_from_expr(arg, provider) {
            Ok(reference) if sumproduct_needs_sparse_iteration(&reference) => {
                let (rows, cols) = reference.bounded_shape().ok_or(ValueError::InvalidValue)?;
                Ok(Self::Sparse {
                    reference,
                    rows,
                    cols,
                })
            }
            Ok(reference) => {
                let grid =
                    runtime_ref_to_grid(&reference, provider).ok_or(ValueError::InvalidValue)?;
                let rows = grid.len() as u32;
                let cols = grid.first().map_or(0, |row| row.len() as u32);
                let data = grid.into_iter().flatten().collect();
                Ok(Self::Dense { rows, cols, data })
            }
            Err(_) => {
                // Keep scalar and Value::Array arguments on the established
                // 1×1 / array-materialization path. Only range references
                // whose endpoint uses an unbounded-axis sentinel go sparse.
                let (rows, cols, data) = arg_to_2d(arg, provider)?;
                Ok(Self::Dense { rows, cols, data })
            }
        }
    }

    fn shape(&self) -> (u32, u32) {
        match self {
            Self::Dense { rows, cols, .. } | Self::Sparse { rows, cols, .. } => (*rows, *cols),
        }
    }

    fn value_at(&self, row: u32, col: u32, provider: &dyn EvalProvider) -> Value {
        match self {
            Self::Dense { cols, data, .. } => data
                .get(row as usize * *cols as usize + col as usize)
                .cloned()
                .unwrap_or(Value::Null),
            Self::Sparse { reference, .. } => {
                let address = reference.normalized().start;
                match &reference.sheet {
                    Some(sheet) => provider.sheet_cell(
                        sheet,
                        CellAddress::new(address.row + row, address.col + col),
                    ),
                    None => provider.cell(CellAddress::new(address.row + row, address.col + col)),
                }
            }
        }
    }
}

fn sumproduct_needs_sparse_iteration(reference: &RuntimeRef) -> bool {
    let range = reference.normalized();
    reference.materialized.is_none()
        && (range.end.row > EXCEL_MAX_ROWS || range.end.col > EXCEL_MAX_COLS)
}

fn sumproduct_product_at(
    args: &[SumproductArg],
    first_value: Value,
    row: u32,
    col: u32,
    provider: &dyn EvalProvider,
) -> Result<f64, ValueError> {
    let mut product = 1.0_f64;
    for (index, arg) in args.iter().enumerate() {
        let value = if index == 0 {
            first_value.clone()
        } else {
            arg.value_at(row, col, provider)
        };
        match value {
            Value::Error(error) => return Err(error),
            Value::Number(number) => product *= number,
            // This short-circuits exactly like the dense path: a blank/text/
            // boolean in an earlier argument turns this position into zero,
            // so later errors are not observed for that position.
            _ => return Ok(0.0),
        }
    }
    Ok(product)
}

pub(super) fn sum_pair_impl(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(f64, f64) -> f64,
) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    let total: f64 = pairs.iter().map(|(x, y)| f(*x, *y)).sum();
    Value::Number(total)
}

/// SUMPRODUCT body. Ordinary arguments retain the 2D materialization path
/// (including scalars as 1×1 and `Value::Array` values). Whole-axis ranges
/// use the existing sparse positional range iterator instead, so a blank
/// rectangle is never represented by a giant grid.
pub(super) fn sumproduct_impl(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() {
        return Value::Error(ValueError::WrongArgCount);
    }
    let mut inputs = Vec::with_capacity(args.len());
    for arg in args {
        match SumproductArg::from_expr(arg, provider) {
            Ok(input) => inputs.push(input),
            Err(error) => return Value::Error(error),
        }
    }

    let (rows, cols) = inputs[0].shape();
    if inputs
        .iter()
        .skip(1)
        .any(|input| input.shape() != (rows, cols))
    {
        return Value::Error(ValueError::InvalidValue);
    }

    let mut total = 0.0_f64;
    match &inputs[0] {
        SumproductArg::Dense { .. } => {
            for row in 0..rows {
                for col in 0..cols {
                    let first_value = inputs[0].value_at(row, col, provider);
                    match sumproduct_product_at(&inputs, first_value, row, col, provider) {
                        Ok(product) => total += product,
                        Err(error) => return Value::Error(error),
                    }
                }
            }
        }
        SumproductArg::Sparse {
            reference, cols, ..
        } => {
            let mut error = None;
            for_each_ref_value_indexed(
                reference,
                provider,
                &mut |_address, position, first_value| {
                    if error.is_some() {
                        return;
                    }
                    let offset = position - 1;
                    let row = (offset / *cols as u64) as u32;
                    let col = (offset % *cols as u64) as u32;
                    match sumproduct_product_at(&inputs, first_value, row, col, provider) {
                        Ok(product) => total += product,
                        Err(value_error) => error = Some(value_error),
                    }
                },
            );
            if let Some(error) = error {
                return Value::Error(error);
            }
        }
    }
    Value::Number(total)
}
