//! 外部资源引用型内建（HYPERLINK / IMAGE）的参数与载荷。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === HYPERLINK + IMAGE ===
//
// Formula-level behaviour only. The host UI is responsible for turning
// the returned text into a clickable link or rendered `<img>`. The
// tests below assert (a) the scalar return value, (b) error
// propagation, (c) arg-count guards, and (d) the structured-text
// payload contract documented on the IMAGE match arm.

/// Build a env with a URL string in A1 so HYPERLINK can read a cell.
fn make_link_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let a2 = AtomId::from_raw(1);
    cm.insert(CellAddress::new(0, 0), a1); // A1
    cm.insert(CellAddress::new(1, 0), a2); // A2
    vs.insert(a1, Value::Text("https://example.com".into()));
    vs.insert(a2, Value::Number(42.0));
    (cm, vs)
}

#[test]
fn eval_hyperlink_with_friendly_name() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str(
            "=HYPERLINK(\"https://example.com\", \"click me\")",
            &cm,
            &vs
        ),
        Value::Text("click me".into())
    );
}

#[test]
fn eval_hyperlink_url_only() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=HYPERLINK(\"https://example.com\")", &cm, &vs),
        Value::Text("https://example.com".into())
    );
}

#[test]
fn eval_hyperlink_cell_ref_url() {
    let (cm, vs) = make_link_env();
    // A1 holds "https://example.com" — used as both link and label.
    assert_eq!(
        eval_str("=HYPERLINK(A1)", &cm, &vs),
        Value::Text("https://example.com".into())
    );
}

#[test]
fn eval_hyperlink_friendly_number_coerces() {
    let (cm, vs) = make_link_env();
    // friendly_name is a Number → coerced to integer text.
    assert_eq!(
        eval_str("=HYPERLINK(A1, A2)", &cm, &vs),
        Value::Text("42".into())
    );
}

#[test]
fn eval_hyperlink_propagates_error_in_link() {
    let (cm, vs) = make_link_env();
    // 1/0 in link_location short-circuits.
    assert_eq!(
        eval_str("=HYPERLINK(1/0, \"x\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_hyperlink_propagates_error_in_friendly() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=HYPERLINK(\"u\", 1/0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_hyperlink_empty_link_returns_empty() {
    let (cm, vs) = make_link_env();
    // No friendly name + empty link → empty text (Excel parity).
    assert_eq!(
        eval_str("=HYPERLINK(\"\")", &cm, &vs),
        Value::Text(String::new())
    );
}

#[test]
fn eval_hyperlink_wrong_arg_count() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=HYPERLINK()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=HYPERLINK(\"a\",\"b\",\"c\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_image_basic() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=IMAGE(\"https://example.com/cat.jpg\")", &cm, &vs),
        Value::Text("<IMAGE: https://example.com/cat.jpg>".into())
    );
}

#[test]
fn eval_image_with_alt() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str(
            "=IMAGE(\"https://example.com/cat.jpg\", \"a cat\")",
            &cm,
            &vs
        ),
        Value::Text("<IMAGE: https://example.com/cat.jpg alt=\"a cat\">".into())
    );
}

#[test]
fn eval_image_sizing_fit() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=IMAGE(\"u\", \"alt\", 2)", &cm, &vs),
        Value::Text("<IMAGE: u alt=\"alt\" sizing=2>".into())
    );
}

#[test]
fn eval_image_custom_dimensions() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=IMAGE(\"u\", \"a\", 3, 120, 240)", &cm, &vs),
        Value::Text("<IMAGE: u alt=\"a\" sizing=3 height=120 width=240>".into())
    );
}

#[test]
fn eval_image_invalid_sizing() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=IMAGE(\"u\", \"a\", 5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=IMAGE(\"u\", \"a\", -1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_image_sizing_3_missing_dimensions() {
    let (cm, vs) = make_link_env();
    // sizing=3 needs both height AND width.
    assert_eq!(
        eval_str("=IMAGE(\"u\", \"a\", 3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=IMAGE(\"u\", \"a\", 3, 120)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_image_sizing_3_non_positive_dimensions() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=IMAGE(\"u\", \"a\", 3, 0, 100)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=IMAGE(\"u\", \"a\", 3, 100, -5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_image_empty_source() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=IMAGE(\"\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_image_propagates_error() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=IMAGE(1/0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=IMAGE(\"u\", 1/0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_image_wrong_arg_count() {
    let (cm, vs) = make_link_env();
    assert_eq!(
        eval_str("=IMAGE()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=IMAGE(\"a\",\"b\",0,1,2,3)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn format_image_payload_escapes_alt_quotes() {
    // Unit-level: confirm the formatter escapes embedded `"` so a
    // downstream parser can recover the original alt text. The formula
    // parser doesn't currently support `""`-escaped quotes inside a
    // string literal, so we drive the helper directly here.
    let s = super::super::format_image_payload("u", Some("a \"b\" c"), 0, None, None);
    assert_eq!(s, "<IMAGE: u alt=\"a \\\"b\\\" c\">");
}
