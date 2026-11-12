//! 分数代码组合回归：字面分隔符、缩放和强制/可选分母占位。
use super::format_number;

fn text(pattern: &str, value: f64) -> String {
    format_number(pattern, value).expect(pattern).text
}

#[test]
fn quoted_and_escaped_slashes_do_not_start_fractions() {
    assert_eq!(text(r#"0"/"0"#, 12.0), "1/2");
    assert_eq!(text(r"0\/0", 12.0), "1/2");
    assert_eq!(text("0/0", 1.5), "3/2");
    assert_eq!(text("yyyy/mm/dd", 45306.0), "2024/01/15");
    assert_eq!(text(r#"# ?/?" / done""#, 5.25), "5 1/4 / done");
}

#[test]
fn fraction_scaling_precedes_approximation() {
    assert_eq!(text("# ?/?%", 0.125), "12 1/2%");
    assert_eq!(text("# ?/?%", -0.125), "-12 1/2%");
    assert_eq!(text("# ?/?,", 5250.0), "5 1/4");
    assert_eq!(text("# ?/?,,", 5_250_000.0), "5 1/4");
    assert_eq!(text("# ?/?,%", 52.5), "5 1/4%");
    assert_eq!(text("# ?/8%", 0.0525), "5 2/8%");
    assert_eq!(text("# ?/10,", 5300.0), "5 3/10");
    assert_eq!(text("# ?/?,", 2990.0), "3    ");
}

#[test]
fn escaped_and_quoted_scaling_characters_stay_literal() {
    assert_eq!(text(r"# ?/?\%", 0.125), " 1/8%");
    assert_eq!(text(r#"# ?/?"%""#, 0.125), " 1/8%");
    assert_eq!(text(r"# ?/?\,", 5.25), "5 1/4,");
    assert_eq!(text(r#"# ?/?",""#, 5.25), "5 1/4,");
    assert_eq!(text(r"# ?/?\,%", 0.0525), "5 1/4,%");
    assert_eq!(text(r"# ?/?,\%", 5250.0), "5 1/4%");
}

#[test]
fn denominator_zeros_are_mandatory_and_question_marks_still_align() {
    assert_eq!(text("# 00/00", 1.5), "1 01/02");
    assert_eq!(text("# ??/??", 5.25), "5  1/4 ");
    assert_eq!(text("# ?0/?0", 1.5), "1  1/2 ");
    assert_eq!(text("# 0?/0?", 1.5), "1 01/02");
    assert_eq!(text("# ?00/?00", 1.5), "1  01/02 ");
    assert_eq!(text("# 0#/#0", 1.5), "1 01/2");
    assert_eq!(text("# ??/16", 0.5), "  8/16");
    assert_eq!(text("?/?", 5.25), "21/4");
}
