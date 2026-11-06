//! Preserve unchanged runs when the ordinary text editor inserts or removes text.
use super::RichTextRun;

fn slice(runs: &[RichTextRun], start: usize, end: usize) -> Vec<RichTextRun> {
    let mut offset = 0;
    let mut result = Vec::new();
    for run in runs {
        let a = start.saturating_sub(offset).min(run.text.len());
        let b = end.saturating_sub(offset).min(run.text.len());
        if a < b { result.push(RichTextRun { text: run.text[a..b].into(), format: run.format.clone() }); }
        offset += run.text.len();
    }
    result
}

pub(super) fn rebase(runs: Vec<RichTextRun>, next: &str) -> Vec<RichTextRun> {
    let old: String = runs.iter().map(|run| run.text.as_str()).collect();
    if old == next { return runs; }
    if next.is_empty() { return Vec::new(); }
    let prefix: usize = old.chars().zip(next.chars()).take_while(|(a, b)| a == b).map(|(c, _)| c.len_utf8()).sum();
    let suffix: usize = old[prefix..].chars().rev().zip(next[prefix..].chars().rev())
        .take_while(|(a, b)| a == b).map(|(c, _)| c.len_utf8()).sum();
    let mut result = slice(&runs, 0, prefix);
    if prefix < next.len() - suffix {
        let mut offset = 0;
        let inherited = runs.iter().find(|run| {
            offset += run.text.len();
            offset >= prefix.max(1)
        }).map(|run| run.format.clone()).unwrap_or_default();
        result.push(RichTextRun { text: next[prefix..next.len() - suffix].into(), format: inherited });
    }
    result.extend(slice(&runs, old.len() - suffix, old.len()));
    // Ordinary inputs already validate length; avoid losing content if a legacy value is longer.
    let mut merged: Vec<RichTextRun> = Vec::new();
    for run in result {
        if let Some(last) = merged.last_mut().filter(|last| last.format == run.format) { last.text.push_str(&run.text); }
        else { merged.push(run); }
    }
    merged
}
