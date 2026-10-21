use super::*;
use einfach_excel_core::comments::{NativeCommentChange, NativeCommentThread};

fn create(source: &mut WasmWorkbook) {
    source.history.change_comment(&mut source.workbook, 0, CellAddress::new(40, 2),
        NativeCommentChange::Create { author: "Alice".into(), body: "第一行\nsecond 🙂".into() }, 1700000000000).unwrap();
}

#[test]
fn comment_native_file_roundtrip_keeps_events_blank_marker_and_legacy_default() {
    let mut source = WasmWorkbook::new();
    source.set_text(0, "A1", "neighbor");
    create(&mut source);
    source.history.change_comment(&mut source.workbook, 0, CellAddress::new(40, 2),
        NativeCommentChange::Resolve { author: "Bob".into() }, 1700000001000).unwrap();
    let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(json["comments"][0]["thread"]["entries"][1]["author"], "Bob");
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(json.clone()).unwrap()).unwrap();
    assert_eq!(restored.comments_json()[0].thread, source.comments_json()[0].thread);
    assert_eq!(restored.get_display(0, "A1"), "neighbor");
    let mut cells = Vec::new();
    restored.append_comment_cells(0, CellRange::single(CellAddress::new(40, 2)), &mut cells);
    assert_eq!(cells.len(), 1);
    assert_eq!(cells[0].comment_indicator, Some(true));
    assert_eq!(cells[0].cell_type, "null");
    let mut legacy = json;
    legacy.as_object_mut().unwrap().remove("comments");
    restored.restore_persistence_v1_json(serde_json::from_value(legacy).unwrap()).unwrap();
    assert!(restored.comments_json().is_empty());
}

#[test]
fn duplicate_outside_and_invalid_thread_file_records_are_rejected() {
    let thread: NativeCommentThread = serde_json::from_value(serde_json::json!({
        "entries": [{"kind":"message","author":"Alice","body":"body","createdAt":1000}],"resolved":false,
    })).unwrap();
    for records in [vec![(0, 0, 0), (0, 0, 0)], vec![(0, 1_048_576, 0)], vec![(2, 0, 0)]] {
        let mut book = Workbook::new();
        assert!(WasmWorkbook::restore_comments_json(&mut book, records.into_iter()
            .map(|(sheet,row,col)| CommentJSON { sheet,row,col,thread: thread.clone() }).collect()).is_err());
    }
    let mut invalid = thread;
    invalid.resolved = true;
    assert!(WasmWorkbook::restore_comments_json(&mut Workbook::new(),
        vec![CommentJSON { sheet:0,row:0,col:0,thread:invalid }]).is_err());
}

#[test]
fn malformed_comment_file_never_replaces_the_open_workbook() {
    let mut source = WasmWorkbook::new();
    source.set_text(0, "A1", "keep me");
    create(&mut source);
    let before = source.comments_json()[0].thread.clone();
    let mut json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    json["comments"][0]["thread"]["entries"][0]["body"] = serde_json::json!(" ");
    assert!(source.restore_persistence_v1_json(serde_json::from_value(json).unwrap()).is_err());
    assert_eq!(source.get_display(0, "A1"), "keep me");
    assert_eq!(source.comments_json()[0].thread, before);
}
