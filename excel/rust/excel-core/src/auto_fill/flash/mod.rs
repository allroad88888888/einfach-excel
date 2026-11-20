//! Flash Fill: discovers adjacent source columns & contiguous block, synthesizes PBE program.
use super::*;
use crate::sheet::Sheet;

mod synth;

const MAX_SOURCE_COLS: usize = 8;
const MAX_SCAN_ROWS: u32 = 50_000;

fn value_to_flash_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::Text(s) => (!s.is_empty()).then(|| s.to_string()),
        Value::Number(n) if n.is_finite() => {
            if n.fract() == 0.0 && n.abs() < 1e15 {
                Some(format!("{}", *n as i64))
            } else {
                Some(n.to_string())
            }
        }
        Value::Boolean(b) => Some(if *b { "TRUE" } else { "FALSE" }.to_owned()),
        _ => None,
    }
}

fn cell_text(sheet: &Sheet, row: u32, col: u32) -> Option<String> {
    let val = crate::sheet::collapse_array_for_eval(sheet.peek_value(CellAddress::new(row, col)));
    value_to_flash_string(&val)
}

fn cell_is_non_empty(sheet: &Sheet, row: u32, col: u32) -> bool {
    let addr = CellAddress::new(row, col);
    sheet.formula_text_at(addr).is_some() || cell_text(sheet, row, col).is_some()
}

fn discover_source_columns(
    sheet: &Sheet,
    target_col: u32,
    probe_rows: impl Iterator<Item = u32> + Clone,
) -> Vec<u32> {
    let has_data = |col: u32| probe_rows.clone().any(|r| cell_is_non_empty(sheet, r, col));
    let mut left = Vec::new();
    let mut col = target_col;
    while col > 0 && left.len() < MAX_SOURCE_COLS {
        col -= 1;
        if has_data(col) {
            left.push(col);
        } else {
            break;
        }
    }
    if !left.is_empty() {
        left.reverse();
        return left;
    }
    let mut right = Vec::new();
    let mut col = target_col + 1;
    while col < EXCEL_MAX_COLS && right.len() < MAX_SOURCE_COLS {
        if has_data(col) {
            right.push(col);
            col += 1;
        } else {
            break;
        }
    }
    right
}

fn row_has_source(sheet: &Sheet, row: u32, cols: &[u32]) -> bool {
    cols.iter().any(|&col| cell_is_non_empty(sheet, row, col))
}

fn discover_block_bounds(
    workbook: &Workbook,
    sheet: &Sheet,
    sheet_idx: usize,
    target: CellRange,
    source_cols: &[u32],
) -> (u32, u32) {
    let target_col = target.start.col;
    // Explicit multi-row selection defines the exact Flash Fill row span.
    if target.rows() > 1 {
        return (target.start.row, target.end.row);
    }
    let anchor = target.start.row;
    let table_bounds = workbook.name(sheet_idx).and_then(|sheet_name| {
        workbook
            .list_tables()
            .into_iter()
            .find(|entry| entry.sheet_name() == sheet_name && entry.range().contains(target.start))
            .map(|entry| {
                let start = entry.range().start.row + u32::from(entry.has_headers());
                let end = entry.range().end.row.saturating_sub(u32::from(entry.has_totals()));
                (start, end)
            })
    });
    if let Some((start, end)) = table_bounds {
        if start <= end {
            return (start, end);
        }
    }

    let mut start = anchor;
    let mut scanned = 0u32;
    while start > 0 && scanned < MAX_SCAN_ROWS {
        let prev = start - 1;
        if row_has_source(sheet, prev, source_cols) || cell_is_non_empty(sheet, prev, target_col) {
            start = prev;
            scanned += 1;
        } else {
            break;
        }
    }
    let mut end = anchor;
    scanned = 0;
    while end + 1 < EXCEL_MAX_ROWS && scanned < MAX_SCAN_ROWS {
        let next = end + 1;
        if row_has_source(sheet, next, source_cols) || cell_is_non_empty(sheet, next, target_col) {
            end = next;
            scanned += 1;
        } else {
            break;
        }
    }
    (start, end)
}

fn parse_flash_value(text: String, numeric_examples: bool) -> Value {
    if numeric_examples {
        let trimmed = text.trim();
        let leading_zero = trimmed.len() > 1
            && trimmed.starts_with('0')
            && !trimmed.starts_with("0.");
        if !leading_zero {
            if let Ok(num) = trimmed.parse::<f64>() {
                if num.is_finite() {
                    return Value::Number(num);
                }
            }
        }
    }
    Value::Text(text.into())
}

pub(super) fn plan(
    workbook: &Workbook,
    sheet: &Sheet,
    request: &AutoFillRequest,
) -> Result<(Vec<PlannedCell>, Option<CellRange>), AutoFillError> {
    let target = request.target_range.normalize();
    if target.cols() != 1 {
        return Err(AutoFillError::InvalidGeometry(
            "Select a single column for Flash Fill.",
        ));
    }
    let target_col = target.start.col;
    let probe_start = target.start.row.saturating_sub(2);
    let probe_end = (target.end.row + 2).min(EXCEL_MAX_ROWS - 1);
    let source_cols = discover_source_columns(sheet, target_col, probe_start..=probe_end);
    if source_cols.is_empty() {
        return Err(AutoFillError::InvalidSource(
            "Place Flash Fill next to a column with source data.",
        ));
    }
    let (block_start, block_end) =
        discover_block_bounds(workbook, sheet, request.sheet_idx, target, &source_cols);
    if (block_end - block_start + 1) as u64 > MAX_AUTO_FILL_CELLS {
        return Err(AutoFillError::TooLarge {
            requested_cells: (block_end - block_start + 1) as u64,
        });
    }

    let read_inputs = |row: u32| -> Vec<String> {
        source_cols
            .iter()
            .map(|&col| cell_text(sheet, row, col).unwrap_or_default())
            .collect()
    };

    let mut examples: Vec<(u32, Vec<String>, String, bool)> = Vec::new();
    for row in block_start..=block_end {
        if let Some(output) = cell_text(sheet, row, target_col) {
            let inputs = read_inputs(row);
            if inputs.iter().any(|s| !s.is_empty()) {
                let is_num = matches!(
                    crate::sheet::collapse_array_for_eval(
                        sheet.peek_value(CellAddress::new(row, target_col))
                    ),
                    Value::Number(_)
                );
                examples.push((row, inputs, output, is_num));
            }
        }
    }

    if examples.is_empty() {
        return Err(AutoFillError::InvalidSource(
            "Provide at least one example in the target column next to source data.",
        ));
    }

    let pairs = |slice: &[(u32, Vec<String>, String, bool)]| -> Vec<(Vec<String>, String)> {
        slice
            .iter()
            .map(|(_, ins, out, _)| (ins.clone(), out.clone()))
            .collect()
    };

    // If row 0 of the block is a header label that breaks synthesis, skip it automatically.
    let (program, active_examples, data_start) =
        if let Some(prog) = synth::synthesize(&pairs(&examples)) {
            (prog, &examples[..], block_start)
        } else if examples.len() >= 2 && examples[0].0 == block_start {
            let without_header = &examples[1..];
            let prog = synth::synthesize(&pairs(without_header)).ok_or(
                AutoFillError::InvalidSource(
                    "We couldn't find a pattern for your data. Provide one or two clear examples.",
                ),
            )?;
            (prog, without_header, block_start + 1)
        } else {
            return Err(AutoFillError::InvalidSource(
                "We couldn't find a pattern for your data. Provide one or two clear examples.",
            ));
        };

    let numeric_examples = active_examples.iter().all(|(_, _, _, is_num)| *is_num);
    let sample_format = sheet.get_format(&CellAddress::new(active_examples[0].0, target_col).to_string());
    let mut planned = Vec::new();
    let mut min_row = u32::MAX;
    let mut max_row = 0u32;

    for row in data_start..=block_end {
        let addr = CellAddress::new(row, target_col);
        if cell_is_non_empty(sheet, row, target_col) {
            continue;
        }
        let inputs = read_inputs(row);
        if !inputs.iter().any(|s| !s.is_empty()) {
            continue;
        }
        if sheet.merged_range_at(addr).is_some() {
            return Err(AutoFillError::InvalidGeometry(
                "unmerge cells before filling this range",
            ));
        }
        if sheet.is_spill_region(addr) || sheet.blocked_anchor_shape(addr).is_some() {
            return Err(AutoFillError::SpillTarget(addr));
        }
        if let Some(out) = program.eval(&inputs) {
            if !out.is_empty() {
                min_row = min_row.min(row);
                max_row = max_row.max(row);
                planned.push(PlannedCell {
                    addr,
                    value: PlannedValue::Primitive(parse_flash_value(out, numeric_examples)),
                    format: sample_format.clone(),
                    rich_text: Vec::new(),
                });
            }
        }
    }

    if planned.is_empty() {
        return Ok((Vec::new(), None));
    }
    let write_range = Some(CellRange::new(
        CellAddress::new(min_row, target_col),
        CellAddress::new(max_row, target_col),
    ));
    Ok((planned, write_range))
}
