use super::*;
use einfach_excel_core::protection::ProtectionChange;
use einfach_excel_core::{BorderSpec, BorderStyle, CellBorders, CellFormat};

#[test]
fn validated_fill_history_uses_actual_border_segments_not_locked_bbox_corners() {
    for infer in [false, true] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        book.set_cell_input(0, "B2", "7").unwrap();
        book.set_cell_input(0, "B3", "1").unwrap();
        book.set_cell_input(0, "A2", "locked corner").unwrap();
        let border = Some(BorderSpec {
            style: BorderStyle::Thin,
            color: Some("#123abc".into()),
        });
        book.sheet_mut(0).unwrap().set_format(
            "B2",
            CellFormat {
                borders: CellBorders {
                    top: border.clone(),
                    right: border.clone(),
                    bottom: border.clone(),
                    left: border,
                },
                ..Default::default()
            },
        );
        let corner = book.sheet(0).unwrap().get_format("A2");
        install(
            &mut book,
            range("B3", "B3"),
            alert(formula("=B3<5", "B3"), ValidationErrorStyle::Information),
        );
        for target in [range("A3", "C3"), range("B2", "B4")] {
            book.change_protection(
                0,
                ProtectionChange::AllowRange {
                    range: target.into(),
                },
            )
            .unwrap();
        }
        book.change_protection(0, ProtectionChange::Protect)
            .unwrap();
        assert!(book.ensure_range_editable(0, range("A2", "A2")).is_err());
        let request = AutoFillRequest {
            source_range: range("B2", "B2"),
            target_range: range("B2", "B3"),
            ..fill()
        };
        let rejected = if infer {
            book.apply_inferred_auto_fill(&request)
        } else {
            book.apply_auto_fill(&request)
        };
        assert!(rejected
            .unwrap_err()
            .to_string()
            .contains("DATA_VALIDATION_INFORMATION"));
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(1.));
        history
            .begin(&book, 0, range("B3", "B3"), "Fill", true)
            .unwrap();
        book.with_validation_confirmation(true, |book| {
            if infer {
                history.apply_inferred_auto_fill(book, &request)
            } else {
                history.apply_auto_fill(book, &request)
            }
        })
        .unwrap();
        history.finish(&mut book, true).unwrap();
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(1.));
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(7.));
        assert_eq!(
            book.get_cell("Sheet1", "A2"),
            Value::Text("locked corner".into())
        );
        assert_eq!(book.sheet(0).unwrap().get_format("A2"), corner);
    }
}
