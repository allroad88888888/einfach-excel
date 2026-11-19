use einfach_core::Value;
use einfach_core::ValueError;
use std::cmp::Ordering;
use super::num;
use super::super::SortDirection;
use super::super::sort_cmp;
use super::super::sort_cmp_with_direction;
use super::text;



#[test]
fn sort_cmp_type_order_ascending() {
    let n = num(5.0);
    let t = text("a");
    let b = Value::Boolean(false);
    let e = Value::Error(ValueError::DivisionByZero);
    let empty = Value::Null;
    // number < text < boolean < error < empty, pairwise.
    let ordered = [&n, &t, &b, &e, &empty];
    for i in 0..ordered.len() {
        for j in 0..ordered.len() {
            let expect = i.cmp(&j);
            assert_eq!(
                sort_cmp(ordered[i], ordered[j], false),
                expect,
                "class {i} vs {j}"
            );
        }
    }
}

#[test]
fn sort_cmp_empty_last_in_both_directions() {
    let n = num(1.0);
    let empty = Value::Null;
    for dir in [SortDirection::Ascending, SortDirection::Descending] {
        assert_eq!(
            sort_cmp_with_direction(&empty, &n, false, dir),
            Ordering::Greater,
            "empty must sink for {dir:?}"
        );
        assert_eq!(
            sort_cmp_with_direction(&n, &empty, false, dir),
            Ordering::Less
        );
        assert_eq!(
            sort_cmp_with_direction(&empty, &empty, false, dir),
            Ordering::Equal
        );
    }
}

#[test]
fn sort_cmp_numbers_negative_zero_serial_nan() {
    assert_eq!(sort_cmp(&num(-3.0), &num(0.0), false), Ordering::Less);
    assert_eq!(sort_cmp(&num(0.0), &num(0.5), false), Ordering::Less);
    // Date serial values are plain numbers.
    assert_eq!(
        sort_cmp(&num(45_000.0), &num(45_001.0), false),
        Ordering::Less
    );
    // NaN: equal to itself, after every real number, before text.
    assert_eq!(
        sort_cmp(&num(f64::NAN), &num(f64::NAN), false),
        Ordering::Equal
    );
    assert_eq!(
        sort_cmp(&num(f64::MAX), &num(f64::NAN), false),
        Ordering::Less
    );
    assert_eq!(sort_cmp(&num(f64::NAN), &text("a"), false), Ordering::Less);
}

#[test]
fn sort_cmp_text_case_fold_default_and_case_sensitive() {
    // Default: case-insensitive code-point order.
    assert_eq!(
        sort_cmp(&text("apple"), &text("Banana"), false),
        Ordering::Less
    );
    assert_eq!(
        sort_cmp(&text("APPLE"), &text("apple"), false),
        Ordering::Equal
    );
    // Case-sensitive: plain code-point order ('B' < 'a').
    assert_eq!(
        sort_cmp(&text("Banana"), &text("apple"), true),
        Ordering::Less
    );
    assert_eq!(
        sort_cmp(&text("APPLE"), &text("apple"), true),
        Ordering::Less
    );
    // Non-ASCII fold: 'É' folds to 'é'.
    assert_eq!(sort_cmp(&text("É"), &text("é"), false), Ordering::Equal);
}

#[test]
fn sort_cmp_booleans_false_before_true() {
    assert_eq!(
        sort_cmp(&Value::Boolean(false), &Value::Boolean(true), false),
        Ordering::Less
    );
    assert_eq!(
        sort_cmp(&Value::Boolean(true), &Value::Boolean(true), false),
        Ordering::Equal
    );
}

#[test]
fn sort_cmp_errors_mutually_equal() {
    let e1 = Value::Error(ValueError::DivisionByZero);
    let e2 = Value::Error(ValueError::InvalidName);
    assert_eq!(sort_cmp(&e1, &e2, false), Ordering::Equal);
    assert_eq!(sort_cmp(&e2, &e1, false), Ordering::Equal);
}

#[test]
fn sort_cmp_descending_reverses_non_empty_only() {
    assert_eq!(
        sort_cmp_with_direction(&num(1.0), &num(2.0), false, SortDirection::Descending),
        Ordering::Greater
    );
    assert_eq!(
        sort_cmp_with_direction(&text("a"), &num(2.0), false, SortDirection::Descending),
        Ordering::Less,
        "descending reverses type classes too (number last among non-empty)"
    );
}
