//! 图片：媒体库字节 → `xl/media` + `xdr:pic`，再读回同一份字节与替代文字；外链图片不写。

mod common;
use common::*;
use serde_json::{json, Value};

const B64: &str = "iVBORw0KGgoAAAANSUhEUmZha2U=";

fn picture(id: &str, media: Option<&str>, payload: Value) -> Value {
    let mut drawing = json!({"id": id, "kind": "image", "anchor": anchor(), "refs": [], "payload": payload});
    if let Some(media) = media {
        drawing["media"] = json!(media);
    }
    drawing
}

fn book(drawings: Vec<Value>) -> String {
    native(drawings, json!({"media": [{"id": "m1", "mime": "image/png", "data": B64}]}))
}

#[test]
fn pictures_export_once_per_image_and_read_back() {
    let exported = export(&book(vec![
        picture("logo", Some("m1"), json!({"alt": "Company logo"})),
        picture("logo-2", Some("m1"), json!({})),
    ]));
    assert!(exported.report_kinds().is_empty(), "{:?}", exported.report_kinds());
    assert!(exported.has_part("xl/media/image1.png"));
    assert!(!exported.has_part("xl/media/image2.png"));
    let drawing = exported.part("xl/drawings/drawing1.xml");
    assert_eq!(drawing.matches("<xdr:pic>").count(), 2);
    assert!(drawing.contains(r#"descr="Company logo""#));
    assert!(exported.part("[Content_Types].xml").contains(r#"<Default Extension="png" ContentType="image/png"/>"#));
    assert!(exported.part("xl/drawings/_rels/drawing1.xml.rels").contains("../media/image1.png"));

    let (native, report) = einfach_xlsx::xlsx_to_native_with_report(exported.bytes.clone(), "Pictures").expect("imports");
    assert!(report.items.is_empty(), "{:?}", report.items);
    let file: Value = serde_json::from_str(&native).unwrap();
    let media = file["workbook"]["media"].as_array().unwrap();
    assert_eq!(media.len(), 1);
    assert_eq!(media[0]["data"], B64);
    let drawings = file["workbook"]["drawings"][0]["drawings"].as_array().unwrap();
    assert_eq!(drawings.len(), 2);
    assert_eq!(drawings[0]["kind"], "image");
    assert_eq!(drawings[0]["id"], "logo");
    assert_eq!(drawings[0]["payload"]["alt"], "Company logo");
    assert_eq!(drawings[0]["media"], media[0]["id"]);
    assert_eq!(drawings[0]["anchor"]["row"], 1);
    assert_eq!(drawings[0]["anchor"]["width"], 480);
}

#[test]
fn linked_pictures_are_reported_not_written() {
    let exported = export(&book(vec![picture("web", None, json!({"src": "https://example.com/a.png"}))]));
    assert_eq!(exported.report_kinds(), [("drawings".to_string(), 1)]);
    assert!(!exported.has_part("xl/drawings/drawing1.xml"));
}
