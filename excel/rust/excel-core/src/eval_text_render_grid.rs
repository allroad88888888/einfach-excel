use super::*;

pub(super) fn format_grid(grid: &[Vec<String>], strict: bool) -> String {
    let inner = grid
        .iter()
        .map(|row| row.join(","))
        .collect::<Vec<_>>()
        .join(";");
    if strict {
        format!("{{{}}}", inner)
    } else {
        inner
    }
}

pub(super) fn render_array_to_text(arr: &Arc<ArrayData>, strict: bool) -> Value {
    let rows = arr.rows as usize;
    let cols = arr.cols as usize;
    let mut grid: Vec<Vec<String>> = vec![vec![String::new(); cols]; rows];
    for r in 0..rows {
        for c in 0..cols {
            let idx = r * cols + c;
            let v = arr.data.get(idx).cloned().unwrap_or(Value::Null);
            grid[r][c] = render_value_to_text(&v, strict);
        }
    }
    Value::Text(format_grid(&grid, strict))
}
