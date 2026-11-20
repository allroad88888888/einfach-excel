//! Align source grids by position or category and emit static values or linked formulas + outlines.
use super::plan::{ConsolidateRequest, SourceGrid};
use crate::formula::push_sheet_name;
use crate::outline::OutlineGroup;
use crate::{value_to_display, CellAddress, CellSnapshot};
use einfach_core::Value;
use std::collections::HashMap;

const PREVIEW_SAMPLE_ROWS: usize = 6;
const PREVIEW_SAMPLE_COLS: usize = 6;

pub(super) type LayoutOutput = (u32, u32, Vec<CellSnapshot>, Vec<OutlineGroup>, Vec<Vec<String>>);

struct LabelAxis {
    keys: HashMap<String, usize>,
    labels: Vec<String>,
}

impl LabelAxis {
    fn new() -> Self {
        Self { keys: HashMap::new(), labels: Vec::new() }
    }
    fn intern(&mut self, value: &Value) -> Option<usize> {
        if matches!(value, Value::Null) {
            return None;
        }
        let text = value_to_display(value);
        if text.trim().is_empty() {
            return None;
        }
        let key = text.to_lowercase();
        if let Some(&idx) = self.keys.get(&key) {
            return Some(idx);
        }
        let idx = self.labels.len();
        self.keys.insert(key, idx);
        self.labels.push(text);
        Some(idx)
    }
}

fn link_formula(sheet_name: &str, addr: CellAddress) -> String {
    let mut out = String::from("=");
    push_sheet_name(&mut out, sheet_name);
    out.push('!');
    out.push_str(&addr.to_string());
    out
}

pub(super) fn build_layout(
    request: &ConsolidateRequest,
    grids: &[SourceGrid],
) -> Result<LayoutOutput, &'static str> {
    let col_start = usize::from(request.left_column);
    let row_start = usize::from(request.top_row);
    let mut col_axis = LabelAxis::new();
    let mut row_axis = LabelAxis::new();
    let mut max_data_cols = 0usize;
    let mut max_data_rows = 0usize;
    let mut corner: Option<String> = None;

    for grid in grids {
        if request.top_row && request.left_column && corner.is_none() {
            let v = grid.get(0, 0);
            if !matches!(v, Value::Null) {
                let text = value_to_display(v);
                if !text.trim().is_empty() {
                    corner = Some(text);
                }
            }
        }
        if request.top_row {
            for c in col_start..grid.cols {
                col_axis.intern(grid.get(0, c));
            }
        } else {
            max_data_cols = max_data_cols.max(grid.cols.saturating_sub(col_start));
        }
        if request.left_column {
            for r in row_start..grid.rows {
                row_axis.intern(grid.get(r, 0));
            }
        } else {
            max_data_rows = max_data_rows.max(grid.rows.saturating_sub(row_start));
        }
    }

    let data_cols = if request.top_row { col_axis.labels.len() } else { max_data_cols };
    let data_rows = if request.left_column { row_axis.labels.len() } else { max_data_rows };
    if data_cols == 0 || data_rows == 0 {
        return Ok((0, 0, Vec::new(), Vec::new(), Vec::new()));
    }

    struct RowContribution {
        sheet_name: String,
        cells: Vec<Option<(CellAddress, Value)>>,
    }
    let mut contributions: Vec<Vec<RowContribution>> = (0..data_rows).map(|_| Vec::new()).collect();
    for grid in grids {
        let col_map: Vec<Option<usize>> = (col_start..grid.cols)
            .map(|c| {
                if request.top_row {
                    let v = grid.get(0, c);
                    if matches!(v, Value::Null) {
                        None
                    } else {
                        col_axis.keys.get(&value_to_display(v).to_lowercase()).copied()
                    }
                } else {
                    Some(c - col_start)
                }
            })
            .collect();
        for r in row_start..grid.rows {
            let Some(row_idx) = (if request.left_column {
                let v = grid.get(r, 0);
                if matches!(v, Value::Null) {
                    None
                } else {
                    row_axis.keys.get(&value_to_display(v).to_lowercase()).copied()
                }
            } else {
                Some(r - row_start)
            }) else {
                continue;
            };
            let mut row_cells: Vec<Option<(CellAddress, Value)>> = vec![None; data_cols];
            let mut any_present = false;
            for (offset, target_col) in col_map.iter().enumerate() {
                let Some(dc) = *target_col else { continue };
                let c = col_start + offset;
                let value = grid.get(r, c).clone();
                if !matches!(value, Value::Null) {
                    any_present = true;
                }
                row_cells[dc] = Some((grid.addr(r, c), value));
            }
            if any_present || !request.create_links {
                contributions[row_idx].push(RowContribution {
                    sheet_name: grid.sheet_name.clone(),
                    cells: row_cells,
                });
            }
        }
    }

    let origin = request.destination;
    let total_cols = col_start + data_cols;
    let mut cells = Vec::new();
    let mut outline_groups = Vec::new();
    let mut sample_rows: Vec<Vec<String>> = Vec::new();
    let mut push_sample = |row_idx: usize, col_idx: usize, text: String| {
        if row_idx < PREVIEW_SAMPLE_ROWS && col_idx < PREVIEW_SAMPLE_COLS {
            while sample_rows.len() <= row_idx {
                sample_rows.push(vec![String::new(); total_cols.min(PREVIEW_SAMPLE_COLS)]);
            }
            sample_rows[row_idx][col_idx] = text;
        }
    };

    let mut cur_row = 0usize;
    if request.top_row {
        if request.left_column {
            if let Some(text) = corner {
                push_sample(cur_row, 0, text.clone());
                cells.push(CellSnapshot::value(origin, Value::Text(text.into())));
            }
        }
        for (dc, label) in col_axis.labels.iter().enumerate() {
            let col_offset = col_start + dc;
            push_sample(cur_row, col_offset, label.clone());
            cells.push(CellSnapshot::value(
                CellAddress::new(origin.row, origin.col + col_offset as u32),
                Value::Text(label.as_str().into()),
            ));
        }
        cur_row += 1;
    }

    let fn_name = request.function.formula_name();
    for (dr, row_contribs) in contributions.iter().enumerate() {
        let mut bucket_values: Vec<Vec<Value>> = (0..data_cols).map(|_| Vec::new()).collect();
        for contrib in row_contribs {
            for (dc, entry) in contrib.cells.iter().enumerate() {
                if let Some((_, value)) = entry {
                    bucket_values[dc].push(value.clone());
                }
            }
        }
        if request.create_links && !row_contribs.is_empty() {
            let detail_start_row = origin.row + cur_row as u32;
            for contrib in row_contribs {
                let row_addr = origin.row + cur_row as u32;
                if request.left_column {
                    push_sample(cur_row, 0, contrib.sheet_name.clone());
                    cells.push(CellSnapshot::value(
                        CellAddress::new(row_addr, origin.col),
                        Value::Text(contrib.sheet_name.as_str().into()),
                    ));
                }
                for (dc, entry) in contrib.cells.iter().enumerate() {
                    if let Some((src_addr, val)) = entry {
                        if !matches!(val, Value::Null) {
                            let col_offset = col_start + dc;
                            let formula = link_formula(&contrib.sheet_name, *src_addr);
                            push_sample(cur_row, col_offset, value_to_display(val));
                            cells.push(CellSnapshot::formula(
                                CellAddress::new(row_addr, origin.col + col_offset as u32),
                                formula,
                            ));
                        }
                    }
                }
                cur_row += 1;
            }
            let detail_end_row = origin.row + cur_row as u32 - 1;
            outline_groups.push(OutlineGroup {
                start: detail_start_row,
                end: detail_end_row,
                collapsed: false,
                subtotal: None,
            });
            let summary_row = origin.row + cur_row as u32;
            if request.left_column {
                let label = &row_axis.labels[dr];
                push_sample(cur_row, 0, label.clone());
                cells.push(CellSnapshot::value(
                    CellAddress::new(summary_row, origin.col),
                    Value::Text(label.as_str().into()),
                ));
            }
            for (dc, vals) in bucket_values.iter().enumerate() {
                if vals.iter().all(|v| matches!(v, Value::Null)) {
                    continue;
                }
                let col_offset = col_start + dc;
                let col_abs = origin.col + col_offset as u32;
                let start_a1 = CellAddress::new(detail_start_row, col_abs);
                let end_a1 = CellAddress::new(detail_end_row, col_abs);
                let formula = format!("={fn_name}({start_a1}:{end_a1})");
                let preview_val = request.function.evaluate(vals);
                push_sample(cur_row, col_offset, value_to_display(&preview_val));
                cells.push(CellSnapshot::formula(
                    CellAddress::new(summary_row, col_abs),
                    formula,
                ));
            }
            cur_row += 1;
        } else {
            let row_addr = origin.row + cur_row as u32;
            if request.left_column {
                let label = &row_axis.labels[dr];
                push_sample(cur_row, 0, label.clone());
                cells.push(CellSnapshot::value(
                    CellAddress::new(row_addr, origin.col),
                    Value::Text(label.as_str().into()),
                ));
            }
            for (dc, vals) in bucket_values.iter().enumerate() {
                let value = request.function.evaluate(vals);
                if !matches!(value, Value::Null) {
                    let col_offset = col_start + dc;
                    push_sample(cur_row, col_offset, value_to_display(&value));
                    cells.push(CellSnapshot::value(
                        CellAddress::new(row_addr, origin.col + col_offset as u32),
                        value,
                    ));
                }
            }
            cur_row += 1;
        }
    }

    Ok((cur_row as u32, total_cols as u32, cells, outline_groups, sample_rows))
}
