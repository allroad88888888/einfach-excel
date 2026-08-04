fn sparse_cells_to_install_payload(
    cells: Vec<SparseCellJSON>,
    sheet_count: usize,
) -> (
    Vec<(
        usize,
        HashMap<CellAddress, Value>,
        HashMap<CellAddress, String>,
    )>,
    u32,
) {
    let mut per_sheet: Vec<(HashMap<CellAddress, Value>, HashMap<CellAddress, String>)> =
        (0..sheet_count).map(|_| Default::default()).collect();
    let mut touched: Vec<bool> = vec![false; sheet_count];
    let mut restored = 0u32;

    for cell in cells {
        if cell.sheet >= sheet_count {
            continue;
        }
        let addr = CellAddress::new(cell.row, cell.col);
        let (primitives, formulas) = &mut per_sheet[cell.sheet];
        let value = match cell.kind.as_str() {
            "number" => match cell.value {
                Some(ImportValueJSON::Number(n)) if n.is_finite() => Value::Number(n),
                _ => continue,
            },
            "text" => match cell.value {
                Some(ImportValueJSON::Text(s)) => Value::Text(s),
                _ => continue,
            },
            "boolean" => match cell.value {
                Some(ImportValueJSON::Boolean(b)) => Value::Boolean(b),
                _ => continue,
            },
            "error" => match cell.value {
                Some(ImportValueJSON::Text(s)) => Value::Error(value_error_from_display(&s)),
                _ => continue,
            },
            "formula" => match cell.value {
                Some(ImportValueJSON::Text(s)) => {
                    primitives.remove(&addr);
                    formulas.insert(addr, s);
                    touched[cell.sheet] = true;
                    restored += 1;
                    continue;
                }
                _ => continue,
            },
            "null" => {
                primitives.remove(&addr);
                formulas.remove(&addr);
                restored += 1;
                continue;
            }
            _ => continue,
        };
        formulas.remove(&addr);
        primitives.insert(addr, value);
        touched[cell.sheet] = true;
        restored += 1;
    }

    let payload = per_sheet
        .into_iter()
        .enumerate()
        .filter(|(sheet_idx, _)| touched[*sheet_idx])
        .map(|(sheet_idx, (primitives, formulas))| (sheet_idx, primitives, formulas))
        .collect();
    (payload, restored)
}
