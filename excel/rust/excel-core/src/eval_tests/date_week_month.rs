//! WEEKDAY/WEEKNUM/ISOWEEKNUM/EOMONTH/EDATE 的周与月定位。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_weekday() {
    let (cm, vs) = make_test_env();
    // 1970-01-01 (serial 0) was Thursday. return_type=1 → Sun=1..Sat=7 → 5.
    assert_eq!(eval_str("=WEEKDAY(0)", &cm, &vs), Value::Number(5.0));
    // Explicit return_type=1.
    assert_eq!(eval_str("=WEEKDAY(0,1)", &cm, &vs), Value::Number(5.0));
    // return_type=2 (Mon=1..Sun=7): Thursday → 4.
    assert_eq!(eval_str("=WEEKDAY(0,2)", &cm, &vs), Value::Number(4.0));
    // return_type=3 (Mon=0..Sun=6): Thursday → 3.
    assert_eq!(eval_str("=WEEKDAY(0,3)", &cm, &vs), Value::Number(3.0));
    // 1970-01-04 is a Sunday (serial 3) → return_type=1 → 1.
    assert_eq!(eval_str("=WEEKDAY(3,1)", &cm, &vs), Value::Number(1.0));
    // Out-of-range return_type → #NUM!.
    assert_eq!(
        eval_str("=WEEKDAY(0,99)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Explicit zero and a trailing omitted slot both coerce to an invalid
    // return_type, so they share Excel's #NUM! result.
    assert_eq!(
        eval_str("=WEEKDAY(0,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=WEEKDAY(45000,)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=WEEKDAY()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=WEEKDAY(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=WEEKDAY(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_weeknum() {
    let (cm, vs) = make_test_env();
    // 1970-01-01 (Thu) — return_type=1 (week starts Sun) → week 1.
    assert_eq!(eval_str("=WEEKNUM(0)", &cm, &vs), Value::Number(1.0));
    // 1970-01-04 is a Sunday → week 2 with return_type=1.
    assert_eq!(eval_str("=WEEKNUM(3,1)", &cm, &vs), Value::Number(2.0));
    // 1970-01-04 (Sun) — return_type=2 (week starts Mon) — still week 1
    // because next Monday hasn't arrived yet.
    assert_eq!(eval_str("=WEEKNUM(3,2)", &cm, &vs), Value::Number(1.0));
    // 1970-01-05 (Mon) — return_type=2 → week 2.
    assert_eq!(eval_str("=WEEKNUM(4,2)", &cm, &vs), Value::Number(2.0));
    // Out-of-range return_type → InvalidValue.
    assert_eq!(
        eval_str("=WEEKNUM(0,99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=WEEKNUM()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=WEEKNUM(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=WEEKNUM(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_eomonth() {
    let (cm, vs) = make_test_env();
    // EOMONTH(DATE(2020,1,15), 1) → 2020-02-29 (leap year).
    let expected = date_serial(2020, 2, 29);
    assert_eq!(
        eval_str("=EOMONTH(DATE(2020,1,15),1)", &cm, &vs),
        Value::Number(expected)
    );
    // Negative offset: EOMONTH(DATE(2020,3,15), -1) → 2020-02-29.
    assert_eq!(
        eval_str("=EOMONTH(DATE(2020,3,15),-1)", &cm, &vs),
        Value::Number(expected)
    );
    // Zero offset returns end of current month.
    assert_eq!(
        eval_str("=EOMONTH(DATE(2021,2,5),0)", &cm, &vs),
        Value::Number(date_serial(2021, 2, 28))
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=EOMONTH(0)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=EOMONTH(\"a\",1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=EOMONTH(A1/C1,1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_edate() {
    let (cm, vs) = make_test_env();
    // Clamp: EDATE(DATE(2020,1,31), 1) → 2020-02-29 (leap year).
    assert_eq!(
        eval_str("=EDATE(DATE(2020,1,31),1)", &cm, &vs),
        Value::Number(date_serial(2020, 2, 29))
    );
    // Plain shift preserving day-of-month.
    assert_eq!(
        eval_str("=EDATE(DATE(2020,1,15),1)", &cm, &vs),
        Value::Number(date_serial(2020, 2, 15))
    );
    // Negative offset.
    assert_eq!(
        eval_str("=EDATE(DATE(2020,3,15),-1)", &cm, &vs),
        Value::Number(date_serial(2020, 2, 15))
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=EDATE(0)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=EDATE(\"a\",1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=EDATE(A1/C1,1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_isoweeknum() {
    let (cm, vs) = make_test_env();
    // 2024-01-01 was a Monday → ISO 2024-W01.
    assert_eq!(
        eval_str("=ISOWEEKNUM(DATE(2024,1,1))", &cm, &vs),
        Value::Number(1.0)
    );
    // 2021-01-01 was a Friday → ISO 2020-W53 (December rollover).
    assert_eq!(
        eval_str("=ISOWEEKNUM(DATE(2021,1,1))", &cm, &vs),
        Value::Number(53.0)
    );
    // 2024-12-31 was a Tuesday → ISO 2025-W01 (next-year rollover).
    assert_eq!(
        eval_str("=ISOWEEKNUM(DATE(2024,12,31))", &cm, &vs),
        Value::Number(1.0)
    );
    // 2020-12-28 (Mon) is the start of ISO 2020-W53.
    assert_eq!(
        eval_str("=ISOWEEKNUM(DATE(2020,12,28))", &cm, &vs),
        Value::Number(53.0)
    );
    // 2024-12-30 (Mon) is the start of ISO 2025-W01.
    assert_eq!(
        eval_str("=ISOWEEKNUM(DATE(2024,12,30))", &cm, &vs),
        Value::Number(1.0)
    );
    // Sun 2024-01-07 is the last day of ISO 2024-W01.
    assert_eq!(
        eval_str("=ISOWEEKNUM(DATE(2024,1,7))", &cm, &vs),
        Value::Number(1.0)
    );
    // Mon 2024-01-08 starts ISO 2024-W02.
    assert_eq!(
        eval_str("=ISOWEEKNUM(DATE(2024,1,8))", &cm, &vs),
        Value::Number(2.0)
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=ISOWEEKNUM()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Type error.
    assert_eq!(
        eval_str("=ISOWEEKNUM(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=ISOWEEKNUM(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
