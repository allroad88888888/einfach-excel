//! Named-list witness protocol, Unicode folding and native generation.
use super::*;
use crate::named_list::{prepare_named_values, NamedListError};

fn builtin_list(name: &str) -> Option<&'static [&'static str]> {
    match name {
        "builtin-weekday-short" => Some(&BUILTIN_WEEKDAY_SHORT),
        "builtin-weekday-long" => Some(&BUILTIN_WEEKDAY_LONG),
        "builtin-month-short" => Some(&BUILTIN_MONTH_SHORT),
        "builtin-month-long" => Some(&BUILTIN_MONTH_LONG),
        _ => None,
    }
}

pub(super) fn normalize_witness(
    series: AutoFillSeries,
    witness: &AutoFillListWitness,
) -> Result<std::collections::HashMap<String, usize>, AutoFillError> {
    if witness.list_name.trim().is_empty()
        || witness.list_name.encode_utf16().count() > 80
    {
        return Err(AutoFillError::InvalidWitness("named series list witness is invalid"));
    }
    let normalized = prepare_named_values(&witness.values, &witness.locale).map_err(|error| {
        AutoFillError::InvalidWitness(match error {
            NamedListError::UnsupportedLocale => "named series locale must be supported and canonical",
            NamedListError::DuplicateEntry => "named series list witness values must be unique",
            _ => "named series list witness is invalid",
        })
    })?;
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
    Ok(normalized)
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
