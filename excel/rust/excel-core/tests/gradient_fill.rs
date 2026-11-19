use einfach_excel_core::{CellAddress, CellFill, CellRange, CellStyle, StyleScope, Workbook,
    workbook_history::WorkbookHistory};
use serde_json::{json, Value};

fn stops() -> Value {
    json!([{"position":0.8,"color":"#ff0000"},{"position":0.2,"color":"#00ff00"},
        {"position":0.2,"color":"#0000ff"}])
}

#[test]
fn gradient_facts_preserve_geometry_order_repeated_positions_and_empty_single_stop_lists() {
    for values in [json!([]), json!([{"position":0.4,"color":"#ABCDEF"}]), stops(),
        json!(vec![json!({"position":0.5,"color":"#123456"}); 256])] {
        for wire in [json!({"kind":"linear-gradient","degree":-1.7e308,"stops":values}),
            json!({"kind":"path-gradient","left":0.9,"right":0.1,"top":0.0,"bottom":0.0,"stops":values})] {
            let fill: CellFill = serde_json::from_value(wire.clone()).unwrap();
            assert_eq!(serde_json::to_value(fill).unwrap(), wire);
        }
    }
}

#[test]
fn invalid_gradient_fields_and_oversized_stops_are_rejected_without_normalizing() {
    let linear = json!({"kind":"linear-gradient","degree":-45,"stops":stops()});
    let path = json!({"kind":"path-gradient","left":0.1,"right":0.7,"top":0.2,"bottom":0.6,"stops":stops()});
    for (source, key, bad) in [
        (linear.clone(), "degree", json!("90")), (linear.clone(), "degree", Value::Null),
        (linear.clone(), "left", json!(0)), (path.clone(), "degree", json!(90)),
        (path.clone(), "right", json!(1.01)), (path.clone(), "bottom", json!(-0.1)),
        (linear.clone(), "stops", json!([{"position":-0.1,"color":"#123456"}])),
        (linear.clone(), "stops", json!([{"position":0.2,"color":"red"}])),
        (linear.clone(), "stops", json!([{"position":0.2,"color":"#123456","extra":true}])),
        (linear, "stops", json!(vec![json!({"position":0.5,"color":"#123456"}); 257])),
    ] {
        let mut wire = source; wire[key] = bad;
        assert!(serde_json::from_value::<CellFill>(wire).is_err(), "{key}");
    }
    let mut missing = path; missing.as_object_mut().unwrap().remove("right");
    assert!(serde_json::from_value::<CellFill>(missing).is_err());
}

#[test]
fn sparse_gradient_replacement_and_clear_share_native_undo_without_changing_values() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "B2", "=12/5").unwrap();
    let cell = CellRange::single(CellAddress::parse("B2").unwrap());
    let fill: CellFill = serde_json::from_value(json!({"kind":"path-gradient",
        "left":0.1,"right":0.7,"top":0.2,"bottom":0.6,"stops":stops()})).unwrap();
    let style = CellStyle { fill: Some(Some(fill.clone())), background: Some(Some("#00ff00".into())),
        ..Default::default() };
    history.patch_format_selection(&mut book, 0, &[(cell, StyleScope::Row)], style).unwrap();
    assert_eq!(history.undo_count(), 1);
    let row_snapshot = book.sheet(0).unwrap().snapshot_format_range(cell);
    assert!(row_snapshot.cell_styles.is_empty());
    assert_eq!(book.sheet(0).unwrap().get_format("C2").fill, Some(fill.clone()));
    history.patch_format_selection(&mut book, 0, &[(cell, StyleScope::Cell)],
        CellStyle { fill: Some(None), ..Default::default() }).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("B2").fill, None);
    assert_eq!(book.sheet(0).unwrap().get_format("C2").fill, Some(fill.clone()));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(cell), row_snapshot);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("B2").fill, None);
    assert_eq!(book.get_cell("Sheet1", "B2"), einfach_core::Value::Number(2.4));
}
