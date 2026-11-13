//! Shared named-list value validation and locale folding for fill and sort.
use std::collections::HashMap;
use unicode_normalization::char::canonical_combining_class;

pub(crate) const MAX_LIST_ITEMS: usize = 512;
const MAX_LIST_UNITS: usize = 16_384;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NamedListError {
    TooShort,
    TooLong,
    EmptyEntry,
    TooManyUnits,
    DuplicateEntry,
    UnsupportedLocale,
}

pub(crate) fn prepare_named_values(
    values: &[String], locale: &str,
) -> Result<HashMap<String, usize>, NamedListError> {
    if values.len() < 2 { return Err(NamedListError::TooShort); }
    if values.len() > MAX_LIST_ITEMS { return Err(NamedListError::TooLong); }
    let language = supported_locale_language(locale).ok_or(NamedListError::UnsupportedLocale)?;
    let mut units = 0;
    let mut ranks = HashMap::with_capacity(values.len());
    for (index, value) in values.iter().enumerate() {
        if value.trim().is_empty() { return Err(NamedListError::EmptyEntry); }
        units += value.encode_utf16().count();
        if units > MAX_LIST_UNITS { return Err(NamedListError::TooManyUnits); }
        if ranks.insert(fold_named_value(value, language), index).is_some() {
            return Err(NamedListError::DuplicateEntry);
        }
    }
    Ok(ranks)
}

pub(crate) fn supported_locale_language(locale: &str) -> Option<&str> {
    let mut parts = locale.split('-');
    let language = parts.next()?;
    if !matches!(language, "en" | "zh" | "tr" | "az") {
        return None;
    }

    let remaining: Vec<&str> = parts.collect();
    let canonical_script = |part: &str| {
        part.len() == 4
            && part.as_bytes()[0].is_ascii_uppercase()
            && part.as_bytes()[1..]
                .iter()
                .all(|byte| byte.is_ascii_lowercase())
    };
    let canonical_region = |part: &str| {
        (part.len() == 2 && part.bytes().all(|byte| byte.is_ascii_uppercase()))
            || (part.len() == 3 && part.bytes().all(|byte| byte.is_ascii_digit()))
    };

    let canonical = match remaining.as_slice() {
        [] => true,
        [part] => canonical_script(part) || canonical_region(part),
        [script, region] => canonical_script(script) && canonical_region(region),
        _ => false,
    };
    canonical.then_some(language)
}

fn turkic_before_dot(chars: &[char], index: usize) -> bool {
    chars[index + 1..]
        .iter()
        .find(|character| matches!(canonical_combining_class(**character), 0 | 230))
        .is_some_and(|character| *character == '\u{0307}')
}

fn turkic_after_i(chars: &[char], index: usize) -> bool {
    chars[..index]
        .iter()
        .rev()
        .find(|character| matches!(canonical_combining_class(**character), 0 | 230))
        .is_some_and(|character| *character == 'I')
}

/// Case-fold a custom-list label so matching is case-insensitive, mirroring
/// ECMA-402 `String.prototype.toLocaleLowerCase` for the supported locale
/// families (JS side: `foldFillSeriesText` in
/// `spreadsheet-ui-core/src/auto-fill/detector.ts`).
///
/// Two passes, because the two contextual rules live in different places.
/// `str::to_lowercase` is locale-independent by contract, so it never applies
/// the Turkic `I` rules and we have to; but it *does* already implement the
/// Final_Sigma rule, driven by the `Cased` / `Case_Ignorable` skiplists that
/// `LOWER()` links into this binary anyway. Delegating to it keeps those two
/// Unicode property tables out of this file — reaching them by hand used to
/// cost a `regex` dependency (~740 KB of wasm with its transitive deps) for
/// nothing.
///
/// The split is safe because of three properties, each pinned by a test in
/// `named_list_fold_matches_ecma_402_*`:
///
/// 1. Pass 1 cannot disturb pass 2's Final_Sigma scan. `I` -> `ı` and
///    `İ` -> `i` both stay Cased and non-Case_Ignorable, so the scan still
///    sees a word character there; `U+0307` is Case_Ignorable, so dropping it
///    only removes a character the scan was going to skip anyway.
/// 2. Pass 2 cannot re-touch pass 1's output: `ı` and `i` are already
///    lowercase, so `to_lowercase` is the identity on them.
/// 3. `Σ` is deliberately left untouched by pass 1. The original single-pass
///    version tested the `Σ` arms before the Turkic arms, but `Σ`, `I`, `İ`
///    and `U+0307` are four distinct characters, so the arm order never
///    mattered and moving the sigma handling to a later pass is order-neutral.
pub(crate) fn fold_named_value(value: &str, language: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let turkic = matches!(language, "tr" | "az");
    // Pass 1: the locale-sensitive Turkic dotted/dotless `I` substitutions.
    let mut staged = String::with_capacity(value.len());
    for (index, character) in chars.iter().copied().enumerate() {
        match character {
            'I' if turkic && !turkic_before_dot(&chars, index) => staged.push('ı'),
            'İ' if turkic => staged.push('i'),
            '\u{0307}' if turkic && turkic_after_i(&chars, index) => {}
            _ => staged.push(character),
        }
    }
    // Pass 2: plain mappings plus the Final_Sigma context rule.
    staged.to_lowercase()
}

