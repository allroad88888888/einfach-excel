//! 浮动对象目录：单对象校验与 `Sheet` 上的 set / remove / reorder / replace 语义。
use einfach_excel_core::drawings::{
    validate_drawing, DrawingAnchor, DrawingRange, SheetDrawing, MAX_DRAWINGS_PER_SHEET,
    MAX_DRAWING_PAYLOAD_BYTES, MAX_DRAWING_REFS,
};
use einfach_excel_core::Workbook;
use serde_json::json;

fn drawing(id: &str) -> SheetDrawing {
    SheetDrawing {
        id: id.to_owned(),
        kind: "chart".to_owned(),
        anchor: DrawingAnchor {
            row: 5,
            col: 3,
            offset_x: 4,
            offset_y: 7,
            width: 200,
            height: 100,
        },
        refs: vec![],
        payload: json!({ "title": "t" }),
        media: None,
    }
}

fn range(r0: u32, c0: u32, r1: u32, c1: u32) -> DrawingRange {
    DrawingRange {
        start_row: r0,
        start_col: c0,
        end_row: r1,
        end_col: c1,
        sheet: None,
    }
}

fn ids(book: &Workbook) -> Vec<String> {
    book.sheet(0)
        .unwrap()
        .drawings()
        .iter()
        .map(|d| d.id.clone())
        .collect()
}

fn with(mutate: impl FnOnce(&mut SheetDrawing)) -> SheetDrawing {
    let mut value = drawing("a");
    mutate(&mut value);
    value
}

#[test]
fn a_well_formed_drawing_passes_validation() {
    assert!(validate_drawing(&drawing("chart-1_A")).is_ok());
}

#[test]
fn ids_must_be_one_to_sixty_four_ascii_token_characters() {
    assert!(validate_drawing(&drawing("")).is_err());
    for bad in ["has space", "dot.id", "中文", "a/b"] {
        assert!(validate_drawing(&drawing(bad)).is_err(), "{bad}");
    }
    assert!(validate_drawing(&drawing(&"x".repeat(64))).is_ok());
    assert!(validate_drawing(&drawing(&"x".repeat(65))).is_err());
}

#[test]
fn kinds_must_be_one_to_thirty_two_lowercase_tokens() {
    assert!(validate_drawing(&with(|d| d.kind.clear())).is_err());
    for bad in ["Chart", "my_kind", "a b", "图"] {
        assert!(
            validate_drawing(&with(|d| d.kind = bad.into())).is_err(),
            "{bad}"
        );
    }
    assert!(validate_drawing(&with(|d| d.kind = "pivot-2".into())).is_ok());
    assert!(validate_drawing(&with(|d| d.kind = "k".repeat(32))).is_ok());
    assert!(validate_drawing(&with(|d| d.kind = "k".repeat(33))).is_err());
}

#[test]
fn anchor_must_stay_inside_the_worksheet() {
    assert!(validate_drawing(&with(|d| d.anchor.row = 1_048_575)).is_ok());
    assert!(validate_drawing(&with(|d| d.anchor.row = 1_048_576)).is_err());
    assert!(validate_drawing(&with(|d| d.anchor.col = 16_383)).is_ok());
    assert!(validate_drawing(&with(|d| d.anchor.col = 16_384)).is_err());
}

#[test]
fn size_must_be_positive_and_bounded_and_offsets_bounded() {
    assert!(validate_drawing(&with(|d| d.anchor.width = 0)).is_err());
    assert!(validate_drawing(&with(|d| d.anchor.height = 0)).is_err());
    assert!(validate_drawing(&with(|d| d.anchor.width = 1)).is_ok());
    assert!(validate_drawing(&with(|d| d.anchor.width = 10_000)).is_ok());
    assert!(validate_drawing(&with(|d| d.anchor.width = 10_001)).is_err());
    assert!(validate_drawing(&with(|d| d.anchor.height = 10_001)).is_err());
    assert!(validate_drawing(&with(|d| d.anchor.offset_x = 0)).is_ok());
    assert!(validate_drawing(&with(|d| d.anchor.offset_x = 10_000)).is_ok());
    assert!(validate_drawing(&with(|d| d.anchor.offset_x = 10_001)).is_err());
    assert!(validate_drawing(&with(|d| d.anchor.offset_y = 10_001)).is_err());
}

#[test]
fn refs_are_capped_and_each_range_must_be_ordered_and_in_bounds() {
    let many = |count: usize| with(|d| d.refs = vec![Some(range(0, 0, 1, 1)); count]);
    assert!(validate_drawing(&many(MAX_DRAWING_REFS)).is_ok());
    assert!(validate_drawing(&many(MAX_DRAWING_REFS + 1)).is_err());
    assert!(validate_drawing(&with(|d| d.refs = vec![None, None])).is_ok());
    for bad in [
        range(3, 0, 2, 0),
        range(0, 3, 0, 2),
        range(0, 0, 1_048_576, 0),
        range(0, 0, 0, 16_384),
    ] {
        assert!(
            validate_drawing(&with(|d| d.refs = vec![Some(bad)])).is_err(),
            "{bad:?}"
        );
    }
    assert!(validate_drawing(&with(
        |d| d.refs = vec![Some(range(0, 0, 1_048_575, 16_383))]
    ))
    .is_ok());
}

#[test]
fn payload_must_be_an_object_no_larger_than_64_kib() {
    for bad in [json!([1]), json!(null), json!("x"), json!(3)] {
        assert!(
            validate_drawing(&with(|d| d.payload = bad.clone())).is_err(),
            "{bad}"
        );
    }
    // `{"d":"…"}` serialises to 8 bytes of framing plus the string body.
    let sized = |bytes: usize| with(|d| d.payload = json!({ "d": "x".repeat(bytes - 8) }));
    assert!(validate_drawing(&sized(MAX_DRAWING_PAYLOAD_BYTES)).is_ok());
    assert!(validate_drawing(&sized(MAX_DRAWING_PAYLOAD_BYTES + 1)).is_err());
}

#[test]
fn set_appends_new_ids_on_top_and_replaces_existing_ids_in_place() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    assert_eq!(sheet.set_drawing(drawing("a")), Ok(true));
    assert_eq!(sheet.set_drawing(drawing("b")), Ok(true));
    assert_eq!(sheet.set_drawing(drawing("c")), Ok(true));
    let moved = with(|d| d.anchor.row = 40);
    assert_eq!(sheet.set_drawing(moved), Ok(true));
    assert_eq!(ids(&book), ["a", "b", "c"]);
    assert_eq!(book.sheet(0).unwrap().drawing("a").unwrap().anchor.row, 40);
    assert!(book.sheet(0).unwrap().drawing("zzz").is_none());
}

#[test]
fn setting_an_identical_drawing_reports_no_change() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    assert_eq!(sheet.set_drawing(drawing("a")), Ok(true));
    assert_eq!(sheet.set_drawing(drawing("a")), Ok(false));
    assert_eq!(ids(&book), ["a"]);
}

#[test]
fn an_invalid_drawing_is_rejected_without_touching_the_catalog() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.set_drawing(drawing("a")).unwrap();
    assert!(sheet.set_drawing(with(|d| d.anchor.width = 0)).is_err());
    assert_eq!(
        book.sheet(0).unwrap().drawing("a").unwrap().anchor.width,
        200
    );
}

#[test]
fn a_sheet_holds_at_most_one_thousand_objects_but_still_edits_existing_ones() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    for i in 0..MAX_DRAWINGS_PER_SHEET {
        assert_eq!(sheet.set_drawing(drawing(&format!("d{i}"))), Ok(true));
    }
    assert!(sheet.set_drawing(drawing("overflow")).is_err());
    assert_eq!(sheet.drawings().len(), MAX_DRAWINGS_PER_SHEET);
    let mut edit = drawing("d7");
    edit.anchor.row = 99;
    assert_eq!(sheet.set_drawing(edit), Ok(true));
    assert!(sheet.remove_drawing("d0"));
    assert_eq!(sheet.set_drawing(drawing("overflow")), Ok(true));
}

#[test]
fn remove_reports_whether_anything_was_deleted() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.set_drawing(drawing("a")).unwrap();
    sheet.set_drawing(drawing("b")).unwrap();
    assert!(sheet.remove_drawing("a"));
    assert!(!sheet.remove_drawing("a"));
    assert!(!sheet.remove_drawing("missing"));
    assert_eq!(ids(&book), ["b"]);
}

#[test]
fn reorder_moves_to_front_or_back_and_reports_no_ops() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    for id in ["a", "b", "c"] {
        sheet.set_drawing(drawing(id)).unwrap();
    }
    assert!(sheet.reorder_drawing("a", true));
    assert_eq!(ids(&book), ["b", "c", "a"]);
    let sheet = book.sheet_mut(0).unwrap();
    assert!(!sheet.reorder_drawing("a", true));
    assert!(sheet.reorder_drawing("a", false));
    assert!(!sheet.reorder_drawing("a", false));
    assert!(sheet.reorder_drawing("c", false));
    assert!(!sheet.reorder_drawing("missing", true));
    assert!(!sheet.reorder_drawing("missing", false));
    assert_eq!(ids(&book), ["c", "a", "b"]);
}

#[test]
fn replace_swaps_the_whole_catalog_only_when_everything_is_valid() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.set_drawing(drawing("old")).unwrap();
    assert!(sheet
        .replace_drawings(vec![drawing("x"), drawing("y")])
        .is_ok());
    assert_eq!(ids(&book), ["x", "y"]);
    let sheet = book.sheet_mut(0).unwrap();
    assert!(sheet.replace_drawings(vec![]).is_ok());
    assert!(sheet.drawings().is_empty());
}

#[test]
fn replace_rejects_duplicates_invalid_entries_and_oversized_lists_atomically() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.set_drawing(drawing("keep")).unwrap();
    assert!(sheet
        .replace_drawings(vec![drawing("x"), drawing("x")])
        .is_err());
    assert!(sheet
        .replace_drawings(vec![drawing("ok"), with(|d| d.kind = "BAD".into())])
        .is_err());
    let too_many = (0..=MAX_DRAWINGS_PER_SHEET)
        .map(|i| drawing(&format!("d{i}")))
        .collect();
    assert!(sheet.replace_drawings(too_many).is_err());
    assert_eq!(ids(&book), ["keep"]);
}

#[test]
fn drawings_belong_to_their_own_sheet() {
    let mut book = Workbook::new();
    let second = book.add_sheet("Other");
    book.sheet_mut(0)
        .unwrap()
        .set_drawing(drawing("a"))
        .unwrap();
    assert!(book.sheet(second).unwrap().drawings().is_empty());
    book.sheet_mut(second)
        .unwrap()
        .set_drawing(drawing("a"))
        .unwrap();
    assert!(book.sheet_mut(0).unwrap().remove_drawing("a"));
    assert_eq!(book.sheet(second).unwrap().drawings().len(), 1);
}
