use super::*;

fn delimited(
    delimiters: &[char],
    merge_consecutive: bool,
    qualifier: Option<char>,
) -> TextColumnsMode {
    TextColumnsMode::Delimited {
        delimiters: delimiters.to_vec(),
        merge_consecutive,
        qualifier,
    }
}

#[test]
fn preserves_empty_fields_spaces_and_leading_zero_text_before_type_conversion() {
    let mode = delimited(&[','], false, Some('"'));
    assert_eq!(
        split_text_columns(",001, a ,,", &mode).unwrap(),
        ["", "001", " a ", "", ""]
    );
    assert_eq!(split_text_columns("", &mode).unwrap(), [""]);
}

#[test]
fn supports_multiple_and_unicode_delimiters() {
    let mode = delimited(&[';', '\t', '、'], false, None);
    assert_eq!(
        split_text_columns("上海;42\t零售、😀", &mode).unwrap(),
        ["上海", "42", "零售", "😀"]
    );
}

#[test]
fn consecutive_option_collapses_runs_without_dropping_boundary_fields() {
    let mode = delimited(&[',', ' '], true, Some('"'));
    assert_eq!(
        split_text_columns(",  one,, two, ", &mode).unwrap(),
        ["", "one", "two", ""]
    );
    assert_eq!(
        split_text_columns("\"one,, two\", end", &mode).unwrap(),
        ["one,, two", "end"]
    );
}

#[test]
fn qualifiers_protect_separators_and_newlines_and_unescape_pairs() {
    let mode = delimited(&[','], false, Some('"'));
    assert_eq!(
        split_text_columns("\"North, America\",\"a\"\"b\",\"line\nnext\"", &mode).unwrap(),
        ["North, America", "a\"b", "line\nnext"]
    );
    assert_eq!(
        split_text_columns("first\nsecond,third", &mode).unwrap(),
        ["first\nsecond", "third"]
    );
}

#[test]
fn single_qualifier_and_no_qualifier_are_explicit_choices() {
    assert_eq!(
        split_text_columns("'a,b',O'Brien", &delimited(&[','], false, Some('\''))).unwrap(),
        ["a,b", "O'Brien"]
    );
    assert_eq!(
        split_text_columns("\"a,b\"", &delimited(&[','], false, None)).unwrap(),
        ["\"a", "b\""]
    );
}

#[test]
fn unterminated_quoted_text_is_rejected_without_silently_losing_the_quote() {
    assert!(split_text_columns("\"a,b", &delimited(&[','], false, Some('"'))).is_err());
    assert_eq!(
        split_text_columns("\"\"", &delimited(&[','], false, Some('"'))).unwrap(),
        [""]
    );
    assert_eq!(
        split_text_columns("a\"b,c", &delimited(&[','], false, Some('"'))).unwrap(),
        ["a\"b", "c"]
    );
}

#[test]
fn fixed_width_counts_unicode_characters_not_utf8_bytes() {
    let mode = TextColumnsMode::FixedWidth {
        breakpoints: vec![2, 5],
    };
    assert_eq!(
        split_text_columns("北京😀AB007", &mode).unwrap(),
        ["北京", "😀AB", "007"]
    );
}

#[test]
fn fixed_width_pads_short_and_empty_records_to_the_same_column_count() {
    let mode = TextColumnsMode::FixedWidth {
        breakpoints: vec![2, 5],
    };
    assert_eq!(split_text_columns("AB", &mode).unwrap(), ["AB", "", ""]);
    assert_eq!(split_text_columns("", &mode).unwrap(), ["", "", ""]);
    assert_eq!(split_text_columns("ABC", &mode).unwrap(), ["AB", "C", ""]);
}

#[test]
fn invalid_split_options_are_rejected_before_processing_text() {
    for breakpoints in [vec![], vec![0], vec![2, 2], vec![5, 2]] {
        assert!(split_text_columns("data", &TextColumnsMode::FixedWidth { breakpoints }).is_err());
    }
    assert!(split_text_columns("data", &delimited(&[], false, None)).is_err());
    assert!(split_text_columns("data", &delimited(&['"'], false, Some('"'))).is_err());
}

#[test]
fn column_limit_is_checked_without_returning_truncated_fields() {
    let last_valid = ",".repeat(EXCEL_MAX_COLS as usize - 1);
    let mode = delimited(&[','], false, None);
    assert_eq!(
        split_text_columns(&last_valid, &mode).unwrap().len(),
        EXCEL_MAX_COLS as usize
    );
    assert!(split_text_columns(&(last_valid + ","), &mode).is_err());
    assert!(split_text_columns(
        "",
        &TextColumnsMode::FixedWidth {
            breakpoints: (1..=EXCEL_MAX_COLS as usize).collect(),
        }
    )
    .is_err());
}

#[test]
fn oversized_source_is_rejected_instead_of_allocating_a_second_unbounded_copy() {
    assert!(split_text_columns(
        &"x".repeat(MAX_TEXT_COLUMN_BYTES + 1),
        &delimited(&[','], false, None)
    )
    .is_err());
}
