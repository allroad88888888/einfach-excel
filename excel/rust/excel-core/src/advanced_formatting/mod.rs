//! Advanced text matching and native base-display comparison share the old CF pipeline.
mod comparison;
mod format_input;
mod wildcard;

pub(crate) use comparison::{display_key, DuplicateComparison};
pub(crate) use format_input::{read_format_keys, sync_format_input};
pub(crate) use wildcard::TextWildcard;
