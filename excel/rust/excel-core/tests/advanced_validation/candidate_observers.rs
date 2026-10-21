//! 候选结算复用原生依赖/spill，但接受前本表及跨表观察者均不可见。
use super::*;
use std::{cell::Cell, rc::Rc};

fn write(
    book: &mut Workbook,
    history: &mut WorkbookHistory,
    operation: &str,
    value: i32,
) -> Result<(), String> {
    match operation {
        "paste" => {
            let clip =
                ClipboardSnapshot::from_tsv(&value.to_string(), ClipboardPasteMode::All).unwrap();
            book.paste_clipboard_with_history(
                &clip,
                0,
                &ClipboardPasteOptions::new(range("A2", "A2")),
                history,
            )
            .map(|_| ())
            .map_err(str::to_string)
        }
        "fill" | "inferred-fill" => {
            let request = AutoFillRequest {
                source_range: range("A1", "A1"),
                target_range: range("A1", "A2"),
                ..fill()
            };
            history
                .begin(book, 0, range("A2", "A2"), "Fill", true)
                .unwrap();
            let result = if operation == "fill" {
                history.apply_auto_fill(book, &request)
            } else {
                history.apply_inferred_auto_fill(book, &request)
            }
            .map(|_| ())
            .map_err(|error| error.to_string());
            history.finish(book, result.is_ok()).unwrap();
            result
        }
        _ => history.set_cell_input(
            book,
            0,
            "A2",
            &match operation {
                "formula" => format!("={value}"),
                "percent" => format!("{}%", value * 100),
                _ => value.to_string(),
            },
        ),
    }
}

#[test]
fn rejected_candidate_spills_never_publish_to_local_or_cross_sheet_subscribers() {
    for operation in [
        "literal",
        "percent",
        "formula",
        "paste",
        "fill",
        "inferred-fill",
    ] {
        for (before, rejected) in [(1, 3), (3, 1)] {
            let mut book = Workbook::new();
            let mut history = WorkbookHistory::default();
            book.set_cell_input(0, "A1", &rejected.to_string()).unwrap();
            book.set_cell_input(0, "A2", &before.to_string()).unwrap();
            book.set_formula(0, "C1", "=SEQUENCE(A2,1,1)");
            book.set_formula(0, "D1", "=SUM(C1:C3)");
            let other = book.add_sheet("Other");
            book.set_formula(other, "E1", "=SUM(Sheet1!C1:C3)");
            install(&mut book, range("A2", "A2"), formula("=FALSE", "A2"));
            let mut observed = Vec::new();
            for (sheet, address) in [(0, "A2"), (0, "C2"), (0, "C3"), (0, "D1"), (other, "E1")] {
                let hits = Rc::new(Cell::new(0));
                let counter = hits.clone();
                book.sheet_mut(sheet)
                    .unwrap()
                    .subscribe_cell(address, move || counter.set(counter.get() + 1));
                observed.push(hits);
            }
            assert!(
                write(&mut book, &mut history, operation, rejected).is_err(),
                "{operation}"
            );
            assert_eq!(history.undo_count(), 0, "{operation}");
            assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(before as f64));
            assert_eq!(
                book.get_cell("Sheet1", "C3"),
                if before == 3 {
                    Value::Number(3.)
                } else {
                    Value::Null
                }
            );
            let sum = if before == 3 { 6. } else { 1. };
            assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(sum));
            assert_eq!(book.get_cell("Other", "E1"), Value::Number(sum));
            assert!(
                observed.iter().all(|hits| hits.get() == 0),
                "{operation} published a rejected candidate"
            );
            install(&mut book, range("A2", "A2"), formula("=TRUE", "A2"));
            write(&mut book, &mut history, operation, rejected).unwrap();
            assert_eq!(history.undo_count(), 1, "{operation}");
            assert!(
                observed.iter().all(|hits| hits.get() == 1),
                "{operation} did not publish exactly the accepted state"
            );
        }
    }
}

#[test]
fn paste_and_both_fill_paths_validate_new_spill_shape_before_commit() {
    for operation in ["paste", "fill", "inferred-fill"] {
        for (before, candidate, condition) in
            [(1, 3, "=C3=3"), (3, 1, "=AND(ISBLANK(C2),SUM(C1:C3)=1)")]
        {
            let mut book = Workbook::new();
            let mut history = WorkbookHistory::default();
            book.set_cell_input(0, "A1", &candidate.to_string())
                .unwrap();
            book.set_cell_input(0, "A2", &before.to_string()).unwrap();
            book.set_formula(0, "C1", "=SEQUENCE(A2,1,1)");
            install(&mut book, range("A2", "A2"), formula(condition, "A2"));
            write(&mut book, &mut history, operation, candidate).unwrap();
            assert_eq!(history.undo_count(), 1, "{operation}");
            assert_eq!(
                book.get_cell("Sheet1", "C3"),
                if candidate == 3 {
                    Value::Number(3.)
                } else {
                    Value::Null
                }
            );
            history.undo(&mut book).unwrap();
            assert_eq!(
                book.get_cell("Sheet1", "C3"),
                if before == 3 {
                    Value::Number(3.)
                } else {
                    Value::Null
                }
            );
        }
    }
}
