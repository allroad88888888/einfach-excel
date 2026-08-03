use einfach_core::Value;

use crate::cell::CellAddress;
use crate::formula::parse_formula;
use crate::sheet::{expr_may_produce_array, source_may_produce_array, Sheet};

/// Parse a CSV string into rows of fields. Handles double-quote escaping
/// per RFC 4180: a field starts with `"`, ends at the next unescaped `"`,
/// and pairs of `""` inside become a single `"`.
///
/// Line endings: `\n` or `\r\n`. Empty trailing newline is dropped.
pub fn parse_csv(input: &str) -> Vec<Vec<String>> {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    current_field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current_field.push(c);
            }
        } else {
            match c {
                '"' if current_field.is_empty() => in_quotes = true,
                ',' => {
                    current_row.push(std::mem::take(&mut current_field));
                }
                '\n' => {
                    current_row.push(std::mem::take(&mut current_field));
                    rows.push(std::mem::take(&mut current_row));
                }
                '\r' => {
                    // Skip CR; the LF that follows handles row break.
                    if chars.peek() != Some(&'\n') {
                        // Lone CR = row break (old Mac).
                        current_row.push(std::mem::take(&mut current_field));
                        rows.push(std::mem::take(&mut current_row));
                    }
                }
                _ => current_field.push(c),
            }
        }
    }
    // Flush trailing field / row that didn't end with a newline.
    if !current_field.is_empty() || !current_row.is_empty() {
        current_row.push(current_field);
        rows.push(current_row);
    }
    rows
}

/// Serialize a 2D grid of values to CSV. Quotes fields that contain `,`,
/// `"`, `\r`, or `\n`. Doubles internal `"` characters per RFC 4180.
pub fn to_csv(rows: &[Vec<String>]) -> String {
    let mut out = String::new();
    for (i, row) in rows.iter().enumerate() {
        for (j, field) in row.iter().enumerate() {
            if j > 0 {
                out.push(',');
            }
            out.push_str(&escape_field(field));
        }
        if i + 1 < rows.len() {
            out.push('\n');
        }
    }
    out
}

fn escape_field(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        let inner = s.replace('"', "\"\"");
        format!("\"{}\"", inner)
    } else {
        s.to_string()
    }
}

/// Import a CSV string into the sheet, starting at top-left = `origin`.
/// Each field is parsed: bare numbers via `parse::<f64>()`, leading `=`
/// becomes a formula, otherwise stored as text. Existing cells in the
/// target rectangle are overwritten.
///
/// Uses `Sheet::bulk_load` so the import does not fire per-cell dirty
/// propagation or subscriber notifications during the loop; the deferred
/// flush at the end notifies each currently-subscribed address at most
/// once. Formula cells stay Dirty until first read — LAZY Step 3.
///
/// 收尾多一步**投影尾**（`Sheet::project_bulk_spill_anchors`），理由与
/// `WorkbookLoader::flush` 那条完全一样：`bulk_load` 只把公式源码停进
/// `formula_source`，新落地的动态数组公式没有任何 Store 边，因此
/// `BulkLoader::flush` 的反向依赖扫描结构上够不着它 —— 不补就是「导进来的
/// `=SEQUENCE(3)` 只显示左上角一个值」。CSV 是第四条批量入口，前三条
/// （`bulk_install_workbook`、`WorkbookLoader::flush`、跨表数组重投影）已在
/// ADR 0006 那批补齐，这里收敛到同一份实现，不另起一套。
///
/// 这条尾巴对 `ATOM_DELEGATION_REWRITE_PLAN` 的 INV-6 是一条**记录在案的
/// 显式豁免**（见该文档 §2「INV-6 的显式例外」），不是违规。
pub fn import_csv(sheet: &mut Sheet, input: &str, origin: CellAddress) {
    let rows = parse_csv(input);
    let mut spill_anchors: Vec<CellAddress> = Vec::new();
    sheet.bulk_load(|loader| {
        for (r, row) in rows.iter().enumerate() {
            for (c, field) in row.iter().enumerate() {
                let addr = CellAddress::new(origin.row + r as u32, origin.col + c as u32);
                let addr_str = addr.to_string_repr();
                if field.starts_with('=') {
                    // `false` = 解析失败（该格已被写成 `#VALUE!`），不可能产出
                    // 数组，所以不进候选集。
                    if loader.set_formula(&addr_str, field) && may_produce_array(field) {
                        spill_anchors.push(addr);
                    }
                } else if field.is_empty() {
                    // Skip empties so partial CSVs don't blanket-overwrite.
                } else if let Ok(n) = field.parse::<f64>() {
                    loader.set_cell(&addr_str, Value::Number(n));
                } else {
                    loader.set_cell(&addr_str, Value::Text(field.clone()));
                }
            }
        }
    });
    // 顺序铁律：投影必须在整批落地**之后**。同一份 CSV 里的字面量可能正好
    // 砸在另一条公式的溢出矩形里，边导边投影会让碰撞判定看到半个世界。
    // ADR 0006 的「clear_spill 先于任何 ensure_cell / store.set」由
    // `recompute_array_formula` 自己保证 —— 这里走的就是写入路径那个入口。
    sheet.project_bulk_spill_anchors(spill_anchors);
}

/// 投影候选闸门，与 `install_bulk_spill_projections` 同款两级：先跑无需解析的
/// 字节筛（绝大多数 `=A1+B1` 在这里就被丢掉），只有活下来的才解析并问 AST。
/// 保住的是「导入不为标量公式做任何解析/求值」这条惰性契约（INV-3/INV-7）。
fn may_produce_array(source: &str) -> bool {
    source_may_produce_array(source)
        && parse_formula(source).is_some_and(|expr| expr_may_produce_array(&expr))
}

/// Export a rectangular region of the sheet as CSV. Formula cells emit
/// their computed display string (consistent with what the user sees).
/// To export the formula source instead, callers can iterate themselves
/// using `Sheet::get_formula`.
pub fn export_csv(sheet: &mut Sheet, top_left: CellAddress, bottom_right: CellAddress) -> String {
    let mut rows: Vec<Vec<String>> = Vec::new();
    for r in top_left.row..=bottom_right.row {
        let mut row: Vec<String> = Vec::new();
        for c in top_left.col..=bottom_right.col {
            let addr = CellAddress::new(r, c).to_string_repr();
            let val = sheet.get_cell(&addr);
            row.push(value_to_csv_field(&val));
        }
        rows.push(row);
    }
    to_csv(&rows)
}

fn value_to_csv_field(v: &Value) -> String {
    match v {
        // CSV 字段是「用户在另一个表格软件里打开会看到什么」，所以它和网格显示
        // 必须是同一个答案，而不是第三份 `format!("{}", n)`。委托给 General 转
        // 文本的单点实现，与 `format::value_to_display` / `eval::coerce_to_text`
        // 共用一份规格。
        Value::Number(n) => crate::general_text::excel_general_to_text(*n),
        Value::Text(s) => s.clone(),
        Value::Boolean(true) => "TRUE".into(),
        Value::Boolean(false) => "FALSE".into(),
        Value::Null => String::new(),
        // NOT `format!("{}", e)`: CSV export is a RENDERING boundary — the
        // field is what a user opens in a spreadsheet — so it speaks Excel's
        // error vocabulary, not the engine's diagnostic one. `Display` would
        // leak `#TYPE!` / `#ARGS!`, codes Excel does not have. See
        // `format::error_display_token`.
        //
        // This is a one-way channel: `import_csv` never re-parses an error
        // token (only `=`-prefixed fields reach the formula parser, and
        // `parse_error_literal` is only reachable from there), so a
        // round-tripped error field comes back as `Value::Text` either way
        // and collapsing the token here costs no fidelity.
        Value::Error(e) => crate::error_display_token(e).into_owned(),
        // Phase 1 spill plumbing: CSV export of an anchor cell collapses
        // to the top-left element. Spilled cells already render their
        // own scalar via the derived atom, so they hit one of the scalar
        // arms above. Reachable only if a caller hands `value_to_csv_field`
        // a raw anchor value without going through `Sheet::peek_value`
        // post-collapse — defensive parity with `coerce_to_text` /
        // wasm `value_to_display`.
        Value::Array(arr) => arr.get(0, 0).map(value_to_csv_field).unwrap_or_default(),
        // Lambdas have no canonical CSV form. They should never escape the
        // evaluator into a persisted cell value — they're transient
        // higher-order-function plumbing. If one ever reaches here it's a
        // bug; render `<lambda>` so the failure is visible rather than
        // panicking on export.
        Value::Lambda(_) => "<lambda>".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use einfach_core::ValueError;

    #[test]
    fn parse_simple() {
        let rows = parse_csv("a,b,c\n1,2,3");
        assert_eq!(rows, vec![vec!["a", "b", "c"], vec!["1", "2", "3"]]);
    }

    #[test]
    fn parse_with_quotes_and_commas() {
        let rows = parse_csv("\"hello, world\",42\n");
        assert_eq!(rows, vec![vec!["hello, world", "42"]]);
    }

    #[test]
    fn parse_escaped_quote() {
        let rows = parse_csv("\"she said \"\"hi\"\"\"\n");
        assert_eq!(rows, vec![vec!["she said \"hi\""]]);
    }

    #[test]
    fn to_csv_quotes_fields_containing_comma() {
        let s = to_csv(&[vec!["plain".into(), "with,comma".into()]]);
        assert_eq!(s, "plain,\"with,comma\"");
    }

    #[test]
    fn roundtrip() {
        let original = vec![
            vec!["name".into(), "note".into()],
            vec!["alice".into(), "hello, world".into()],
        ];
        let s = to_csv(&original);
        let parsed = parse_csv(&s);
        assert_eq!(parsed, original);
    }

    #[test]
    fn import_export_through_sheet() {
        let mut sheet = Sheet::new();
        import_csv(&mut sheet, "1,2,3\n4,5,6\n", CellAddress::new(0, 0));
        assert_eq!(sheet.get_cell("A1"), Value::Number(1.0));
        assert_eq!(sheet.get_cell("C2"), Value::Number(6.0));

        let exported = export_csv(&mut sheet, CellAddress::new(0, 0), CellAddress::new(1, 2));
        assert_eq!(exported, "1,2,3\n4,5,6");
    }

    #[test]
    fn import_recognizes_formula() {
        let mut sheet = Sheet::new();
        import_csv(&mut sheet, "10,20,=A1+B1", CellAddress::new(0, 0));
        assert_eq!(sheet.get_cell("C1"), Value::Number(30.0));
    }

    /// CSV export goes through the display boundary, so the engine-internal
    /// `WrongType` variant renders as Excel's `#VALUE!` — never `#TYPE!`,
    /// a code Excel does not have.
    #[test]
    fn export_renders_wrong_type_as_value_token() {
        let mut sheet = Sheet::new();
        sheet.set_cell("A1", Value::Text("yes".into()));
        sheet.set_formula("B1", "=NOT(A1)");
        assert_eq!(
            sheet.get_cell("B1"),
            Value::Error(ValueError::WrongType),
            "precondition: NOT(text) must grade as the internal WrongType variant"
        );

        let exported = export_csv(&mut sheet, CellAddress::new(0, 1), CellAddress::new(0, 1));
        assert_eq!(exported, "#VALUE!");
    }

    /// Import never re-parses an error token, so the export-side collapse of
    /// `#TYPE!` -> `#VALUE!` costs no round-trip fidelity: both tokens land
    /// as `Value::Text`, neither becomes a `Value::Error`. This is what makes
    /// the display boundary safe to apply in `value_to_csv_field`.
    #[test]
    fn import_does_not_revive_error_tokens() {
        let mut sheet = Sheet::new();
        import_csv(&mut sheet, "#VALUE!,#TYPE!,#DIV/0!", CellAddress::new(0, 0));
        assert_eq!(sheet.get_cell("A1"), Value::Text("#VALUE!".into()));
        assert_eq!(sheet.get_cell("B1"), Value::Text("#TYPE!".into()));
        assert_eq!(sheet.get_cell("C1"), Value::Text("#DIV/0!".into()));
    }
}
