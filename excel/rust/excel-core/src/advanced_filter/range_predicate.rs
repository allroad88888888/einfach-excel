//! Scalar tests compiled from the typed values in a criteria range.
use crate::eval::{parse_criterion_op, pattern_has_wildcard, wildcard_match};
use einfach_core::Value;
use std::cmp::Ordering;

#[derive(Clone, Copy)]
enum Comparison {
    Equal,
    NotEqual,
    Greater,
    GreaterEqual,
    Less,
    LessEqual,
}

impl Comparison {
    fn from_operator(operator: &str) -> Self {
        match operator {
            "<>" => Self::NotEqual,
            ">" => Self::Greater,
            ">=" => Self::GreaterEqual,
            "<" => Self::Less,
            "<=" => Self::LessEqual,
            _ => Self::Equal,
        }
    }

    fn matches(self, order: Option<Ordering>) -> bool {
        match self {
            Self::Equal => order == Some(Ordering::Equal),
            Self::NotEqual => order != Some(Ordering::Equal),
            Self::Greater => order == Some(Ordering::Greater),
            Self::GreaterEqual => matches!(order, Some(Ordering::Greater | Ordering::Equal)),
            Self::Less => order == Some(Ordering::Less),
            Self::LessEqual => matches!(order, Some(Ordering::Less | Ordering::Equal)),
        }
    }

    fn is_equality(self) -> bool {
        matches!(self, Self::Equal | Self::NotEqual)
    }
}

enum ScalarTest {
    Blank(Comparison),
    Number(Comparison, f64),
    Boolean(Comparison, bool),
    Text(Comparison, String),
    Prefix(String),
    Wildcard(Comparison, String),
}

pub(super) struct Predicate(ScalarTest);

impl Predicate {
    pub(super) fn compile(value: &Value) -> Result<Option<Self>, &'static str> {
        let test = match value {
            Value::Null => return Ok(None),
            Value::Text(text) if text.is_empty() => return Ok(None),
            Value::Text(text) => Self::compile_text(text),
            Value::Number(number) if number.is_finite() => {
                ScalarTest::Number(Comparison::Equal, *number)
            }
            Value::Boolean(boolean) => ScalarTest::Boolean(Comparison::Equal, *boolean),
            _ => return Err("A criteria cell must contain a scalar without an error."),
        };
        Ok(Some(Self(test)))
    }

    fn compile_text(text: &str) -> ScalarTest {
        let (operator, operand) = parse_criterion_op(text);
        let comparison = Comparison::from_operator(operator);
        let explicit = operand.len() < text.len();
        if operand.is_empty() && comparison.is_equality() {
            return ScalarTest::Blank(comparison);
        }
        if comparison.is_equality() && pattern_has_wildcard(operand) {
            return ScalarTest::Wildcard(comparison, operand.to_owned());
        }
        if !explicit {
            return ScalarTest::Prefix(operand.to_lowercase());
        }
        let trimmed = operand.trim();
        if let Ok(number) = trimmed.parse::<f64>() {
            if number.is_finite() {
                return ScalarTest::Number(comparison, number);
            }
        }
        if comparison.is_equality() {
            if trimmed.eq_ignore_ascii_case("true") {
                return ScalarTest::Boolean(comparison, true);
            }
            if trimmed.eq_ignore_ascii_case("false") {
                return ScalarTest::Boolean(comparison, false);
            }
        }
        ScalarTest::Text(comparison, operand.to_lowercase())
    }

    pub(super) fn matches(&self, value: &Value) -> bool {
        match &self.0 {
            ScalarTest::Blank(comparison) => {
                let blank = matches!(value, Value::Null) || value.as_text() == Some("");
                comparison.matches(blank.then_some(Ordering::Equal))
            }
            ScalarTest::Number(comparison, target) => comparison.matches(
                value
                    .as_number()
                    .and_then(|number| number.partial_cmp(target)),
            ),
            ScalarTest::Boolean(comparison, target) => {
                comparison.matches(value.as_bool().map(|boolean| boolean.cmp(target)))
            }
            ScalarTest::Text(comparison, target) => {
                comparison.matches(value.as_text().map(|text| text.to_lowercase().cmp(target)))
            }
            ScalarTest::Prefix(prefix) => value
                .as_text()
                .is_some_and(|text| text.to_lowercase().starts_with(prefix)),
            ScalarTest::Wildcard(comparison, pattern) => {
                let matched = value
                    .as_text()
                    .is_some_and(|text| wildcard_match(pattern, text));
                comparison.matches(matched.then_some(Ordering::Equal))
            }
        }
    }
}
