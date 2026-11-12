//! Named-list witness protocol, Unicode folding and native generation.
use super::*;
use unicode_normalization::char::canonical_combining_class;

fn builtin_list(name: &str) -> Option<&'static [&'static str]> {
    match name {
        "builtin-weekday-short" => Some(&BUILTIN_WEEKDAY_SHORT),
        "builtin-weekday-long" => Some(&BUILTIN_WEEKDAY_LONG),
        "builtin-month-short" => Some(&BUILTIN_MONTH_SHORT),
        "builtin-month-long" => Some(&BUILTIN_MONTH_LONG),
        _ => None,
    }
}

pub(super) fn supported_locale_language(locale: &str) -> Option<&str> {
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
pub(super) fn fold_named_value(value: &str, language: &str) -> String {
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

pub(super) fn normalize_witness(
    series: AutoFillSeries,
    witness: &AutoFillListWitness,
) -> Result<std::collections::HashMap<String, usize>, AutoFillError> {
    if witness.list_name.trim().is_empty()
        || witness.list_name.encode_utf16().count() > 80
        || witness
            .values
            .iter()
            .map(|v| v.encode_utf16().count())
            .sum::<usize>()
            > 16_384
        || witness.values.len() < 2
        || witness.values.len() > LIST_MAX_ITEMS
        || witness.values.iter().any(|value| value.trim().is_empty())
    {
        return Err(AutoFillError::InvalidWitness(
            "named series list witness is invalid",
        ));
    }
    let language = supported_locale_language(&witness.locale).ok_or(
        AutoFillError::InvalidWitness("named series locale must be supported and canonical"),
    )?;
    let normalized: Vec<String> = witness
        .values
        .iter()
        .map(|value| fold_named_value(value, language))
        .collect();
    let mut unique = std::collections::HashSet::with_capacity(normalized.len());
    if normalized.iter().any(|value| !unique.insert(value)) {
        return Err(AutoFillError::InvalidWitness(
            "named series list witness values must be unique",
        ));
    }
    // List names are protocol identifiers. Reserved prefixes always use
    // locale-independent ASCII casing, even for Turkish/Azeri witnesses.
    let lower_name = witness.list_name.to_ascii_lowercase();
    if series == AutoFillSeries::CustomList
        && (lower_name.starts_with("builtin-") || lower_name.starts_with("locale-"))
    {
        return Err(AutoFillError::InvalidWitness(
            "custom list witness may not use a reserved list name",
        ));
    }
    if lower_name.starts_with("builtin-") {
        if witness.locale != "en" {
            return Err(AutoFillError::InvalidWitness(
                "built-in list witness locale must be en",
            ));
        }
        let canonical = builtin_list(&witness.list_name).ok_or(AutoFillError::InvalidWitness(
            "unknown built-in list witness",
        ))?;
        if canonical.len() != witness.values.len()
            || canonical
                .iter()
                .zip(&witness.values)
                .any(|(left, right)| *left != right)
        {
            return Err(AutoFillError::InvalidWitness(
                "built-in list witness does not match the canonical list",
            ));
        }
    }
    match series {
        AutoFillSeries::WeekdayName
            if !(witness.list_name.starts_with("builtin-weekday-")
                || witness.list_name == "locale-weekday") =>
        {
            return Err(AutoFillError::InvalidWitness(
                "weekday series kind does not match its list witness",
            ))
        }
        AutoFillSeries::MonthName
            if !(witness.list_name.starts_with("builtin-month-")
                || witness.list_name == "locale-month") =>
        {
            return Err(AutoFillError::InvalidWitness(
                "month series kind does not match its list witness",
            ))
        }
        _ => {}
    }
    Ok(normalized
        .into_iter()
        .enumerate()
        .map(|(index, value)| (value, index))
        .collect())
}

pub(super) fn plan_named_series(
    sheet: &crate::Sheet,
    request: &AutoFillRequest,
    write_range: Option<CellRange>,
) -> Result<Vec<PlannedCell>, AutoFillError> {
    let step = requested_step(request)?;
    if step.fract() != 0.0 || step.abs() > LIST_MAX_ITEMS as f64 {
        return Err(AutoFillError::InvalidStep(
            "named series step must be a non-zero integer within the list limit",
        ));
    }
    let witness = request.list.as_ref().ok_or(AutoFillError::InvalidWitness(
        "named series require a list witness",
    ))?;
    let prepared = request.named_lists.entries().iter().find(|entry| {
        std::sync::Arc::ptr_eq(&entry.witness, witness) && entry.series == request.series
    });
    let normalized;
    let indices_by_value = if let Some(entry) = prepared {
        &entry.indices
    } else {
        normalized = normalize_witness(request.series, witness)?;
        &normalized
    };
    let language = supported_locale_language(&witness.locale).unwrap();
    let source = source_texts(sheet, request)?;
    let indices: Vec<usize> = source
        .iter()
        .map(|value| {
            indices_by_value
                .get(&fold_named_value(value, language))
                .copied()
                .ok_or(AutoFillError::InvalidSource(
                    "source strings do not belong to the requested named list",
                ))
        })
        .collect::<Result<_, _>>()?;
    let step_i64 = step as i64;
    let first = *indices.first().ok_or(AutoFillError::InvalidSource(
        "named series require source cells",
    ))? as i64;
    let list_len = witness.values.len() as i64;
    if indices.iter().enumerate().any(|(index, actual)| {
        (first + step_i64 * index as i64).rem_euclid(list_len) != *actual as i64
    }) {
        return Err(AutoFillError::InvalidSource(
            "source strings do not match the requested named-list step",
        ));
    }
    plan_generated(sheet, request, write_range, |relative| {
        let index = (first + step_i64 * relative).rem_euclid(list_len) as usize;
        Ok(Value::Text(witness.values[index].as_str().into()))
    })
}
