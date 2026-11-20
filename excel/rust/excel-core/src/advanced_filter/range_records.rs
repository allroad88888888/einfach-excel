//! Typed row identity for the unique-records option.
use crate::format::error_display_token;
use einfach_core::Value;
use std::hash::{Hash, Hasher};

#[derive(PartialEq, Eq, Hash)]
enum RecordValue<'a> {
    Blank,
    Text(CaseInsensitiveText<'a>),
    Number(u64),
    Boolean(bool),
    Error(std::borrow::Cow<'static, str>),
}

impl<'a> From<&'a Value> for RecordValue<'a> {
    fn from(value: &'a Value) -> Self {
        match value {
            Value::Null | Value::Array(_) | Value::Lambda(_) => Self::Blank,
            Value::Text(text) => Self::Text(CaseInsensitiveText(text)),
            Value::Number(number) => {
                Self::Number(if *number == 0.0 { 0 } else { number.to_bits() })
            }
            Value::Boolean(boolean) => Self::Boolean(*boolean),
            Value::Error(error) => Self::Error(error_display_token(error)),
        }
    }
}

struct CaseInsensitiveText<'a>(&'a str);

impl CaseInsensitiveText<'_> {
    fn characters(&self) -> impl Iterator<Item = char> + '_ {
        self.0.chars().flat_map(char::to_lowercase)
    }
}

impl PartialEq for CaseInsensitiveText<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0 || self.characters().eq(other.characters())
    }
}

impl Eq for CaseInsensitiveText<'_> {}

impl Hash for CaseInsensitiveText<'_> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        for character in self.characters() {
            character.hash(state);
        }
        u32::MAX.hash(state);
    }
}

#[derive(PartialEq, Eq, Hash)]
pub(super) struct RecordKey<'a>(Vec<RecordValue<'a>>);

impl<'a> From<&'a [Value]> for RecordKey<'a> {
    fn from(values: &'a [Value]) -> Self {
        Self(values.iter().map(RecordValue::from).collect())
    }
}
