//! Native text membership and full-cycle order checks against prepared candidates.
use super::*;

pub(super) fn infer_named_series(
    sheet: &crate::Sheet,
    request: AutoFillRequest,
) -> Result<AutoFillRequest, AutoFillError> {
    if request.series == AutoFillSeries::CustomList {
        let witness = request.list.as_ref().ok_or(AutoFillError::InvalidWitness(
            "enter a custom list with at least two items",
        ))?;
        let indices = named_series::normalize_witness(request.series, witness)?;
        return choose(
            sheet,
            request.clone(),
            request.series,
            witness.clone(),
            &indices,
        );
    }
    infer_candidates(sheet, request, false)
}

pub(super) fn infer_automatic_named_series(
    sheet: &crate::Sheet,
    request: AutoFillRequest,
) -> Result<AutoFillRequest, AutoFillError> {
    infer_candidates(sheet, request, true)
}

fn infer_candidates(
    sheet: &crate::Sheet,
    request: AutoFillRequest,
    automatic: bool,
) -> Result<AutoFillRequest, AutoFillError> {
    let source = source_texts(sheet, &request)?;
    // en/zh share the same fold, as do tr/az. Fold each lane's source at most twice.
    let standard: Vec<_> = source
        .iter()
        .map(|value| fold_named_value(value, "en"))
        .collect();
    let mut turkic = None;
    for entry in request.named_lists.entries() {
        if !automatic && entry.series != request.series {
            continue;
        }
        let language = supported_locale_language(&entry.witness.locale).unwrap();
        let folded = if matches!(language, "tr" | "az") {
            turkic.get_or_insert_with(|| {
                source
                    .iter()
                    .map(|value| fold_named_value(value, "tr"))
                    .collect()
            })
        } else {
            &standard
        };
        if let Some(step) = matching_step(folded, &entry.indices, entry.witness.values.len()) {
            let mut candidate = request.clone();
            candidate.series = entry.series;
            candidate.step = Some(step as f64);
            candidate.list = Some(entry.witness.clone());
            return Ok(candidate);
        }
    }
    Err(AutoFillError::InvalidSource(
        "source strings do not match this named list",
    ))
}

fn choose(
    sheet: &crate::Sheet,
    mut request: AutoFillRequest,
    series: AutoFillSeries,
    witness: std::sync::Arc<AutoFillListWitness>,
    indices: &std::collections::HashMap<String, usize>,
) -> Result<AutoFillRequest, AutoFillError> {
    let language = supported_locale_language(&witness.locale).unwrap();
    let folded: Vec<_> = source_texts(sheet, &request)?
        .iter()
        .map(|value| fold_named_value(value, language))
        .collect();
    let step = matching_step(&folded, indices, witness.values.len()).ok_or(
        AutoFillError::InvalidSource("source strings do not match this named list"),
    )?;
    request.series = series;
    request.step = Some(step as f64);
    request.list = Some(witness);
    Ok(request)
}

fn matching_step(
    source: &[String],
    lookup: &std::collections::HashMap<String, usize>,
    len: usize,
) -> Option<usize> {
    let indices: Vec<_> = source
        .iter()
        .map(|value| lookup.get(value).copied())
        .collect::<Option<_>>()?;
    let first = *indices.first()?;
    let step = if indices.len() > 1 {
        (indices[1] + len - first) % len
    } else {
        1
    };
    if step == 0
        || indices
            .iter()
            .enumerate()
            .any(|(i, actual)| (first + step * i) % len != *actual)
    {
        return None;
    }
    Some(step)
}
