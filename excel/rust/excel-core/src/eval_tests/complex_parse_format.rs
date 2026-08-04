//! 复数字符串的解析与格式化。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn parse_complex_simple_forms() {
    assert_eq!(parse_complex("3+4i").unwrap(), (3.0, 4.0, 'i'));
    assert_eq!(parse_complex("3-4j").unwrap(), (3.0, -4.0, 'j'));
    assert_eq!(parse_complex("5").unwrap(), (5.0, 0.0, 'i'));
    assert_eq!(parse_complex("-2i").unwrap(), (0.0, -2.0, 'i'));
    assert_eq!(parse_complex("2i").unwrap(), (0.0, 2.0, 'i'));
    assert_eq!(parse_complex("i").unwrap(), (0.0, 1.0, 'i'));
    assert_eq!(parse_complex("j").unwrap(), (0.0, 1.0, 'j'));
    assert_eq!(parse_complex("-i").unwrap(), (0.0, -1.0, 'i'));
    assert_eq!(parse_complex("+i").unwrap(), (0.0, 1.0, 'i'));
    // Decimals + scientific notation must not be split on the `+`
    // / `-` inside the exponent.
    assert_eq!(parse_complex("3.14+2.5i").unwrap(), (3.14, 2.5, 'i'));
    let (r, i, s) = parse_complex("1.5e+3+2.5i").unwrap();
    assert!((r - 1500.0).abs() < 1e-9);
    assert_eq!(i, 2.5);
    assert_eq!(s, 'i');
    let (r, i, s) = parse_complex("1e-3-2i").unwrap();
    assert!((r - 0.001).abs() < 1e-9);
    assert_eq!(i, -2.0);
    assert_eq!(s, 'i');
}

#[test]
fn parse_complex_rejects_garbage() {
    assert_eq!(parse_complex("garbage"), Err(ValueError::InvalidValue));
    assert_eq!(parse_complex(""), Err(ValueError::InvalidValue));
    assert_eq!(parse_complex("3+i+4i"), Err(ValueError::InvalidValue));
    assert_eq!(parse_complex("3+4k"), Err(ValueError::InvalidValue));
}

#[test]
fn format_complex_round_trip() {
    // Real-only drops suffix.
    assert_eq!(format_complex(3.0, 0.0, 'i'), "3");
    // Pure-imaginary drops coefficient when ±1.
    assert_eq!(format_complex(0.0, 1.0, 'i'), "i");
    assert_eq!(format_complex(0.0, -1.0, 'i'), "-i");
    assert_eq!(format_complex(0.0, 2.0, 'j'), "2j");
    // Combined forms.
    assert_eq!(format_complex(3.0, 4.0, 'i'), "3+4i");
    assert_eq!(format_complex(3.0, -4.0, 'i'), "3-4i");
    // ±1 coefficient drops in the imaginary part.
    assert_eq!(format_complex(3.0, 1.0, 'i'), "3+i");
    assert_eq!(format_complex(3.0, -1.0, 'i'), "3-i");
}

#[test]
fn eval_complex_constructor() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COMPLEX(3,4)", &cm, &vs),
        Value::Text("3+4i".into())
    );
    assert_eq!(
        eval_str("=COMPLEX(3,4,\"j\")", &cm, &vs),
        Value::Text("3+4j".into())
    );
    assert_eq!(eval_str("=COMPLEX(3,0)", &cm, &vs), Value::Text("3".into()));
    assert_eq!(eval_str("=COMPLEX(0,1)", &cm, &vs), Value::Text("i".into()));
    // Bad suffix → #VALUE!.
    assert_eq!(
        eval_str("=COMPLEX(3,4,\"k\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=COMPLEX(3)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COMPLEX(3,4,\"i\",5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_complex_type_error_on_array() {
    // Passing a range to a complex function — the eval path turns
    // a Range expression into either a single cell or an Array;
    // we surface WrongType when the value isn't text/number/etc.
    let (cm, vs) = make_test_env();
    // B2 holds text "text" — not a valid complex string → InvalidValue.
    assert_eq!(
        eval_str("=IMABS(B2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
