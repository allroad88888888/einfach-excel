//! CF uses the established Unicode-aware wildcard engine, with editable pattern validation.
use crate::find_wildcard::FindWildcard;

pub(crate) struct TextWildcard {
    matcher: FindWildcard,
    matches_empty: bool,
}

impl TextWildcard {
    pub(crate) fn new(pattern: &str) -> Result<Self, &'static str> {
        // A doubled tilde escapes itself; an unmatched trailing tilde is an incomplete draft.
        if pattern.chars().rev().take_while(|ch| *ch == '~').count() % 2 != 0 {
            return Err("Finish the wildcard escape with *, ? or ~.");
        }
        Ok(Self {
            matcher: FindWildcard::new(pattern, false, true),
            matches_empty: pattern.chars().all(|ch| ch == '*'),
        })
    }

    /// `?` consumes one original Unicode scalar, even when lowercase expands a character.
    /// Budget failures skip both positive and negative rules instead of reversing an error.
    pub(crate) fn matches(&self, text: &str) -> Result<bool, &'static str> {
        if text.is_empty() {
            return Ok(self.matches_empty);
        }
        self.matcher.spans(text).map(|spans| !spans.is_empty())
    }
}
