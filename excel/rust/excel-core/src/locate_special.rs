//! 定位条件扩展收集器：批注/备注、条件格式（全部/相同）、数据验证（全部/相同）。
#[path = "locate_trace.rs"]
mod trace;

use crate::data_validation::{DataValidationKind, DataValidationRule};
use crate::{CellAddress, CellRange, LocateKind, Workbook};
use std::collections::BTreeSet;
use trace::{trace_dependent_rects, trace_precedent_rects};

pub(crate) fn expand_merges(source: &crate::Sheet, mut range: CellRange) -> CellRange {
    loop {
        let previous = range;
        for merged in source.merged_ranges() {
            if merged.intersects(range) {
                range.start.row = range.start.row.min(merged.start.row);
                range.start.col = range.start.col.min(merged.start.col);
                range.end.row = range.end.row.max(merged.end.row);
                range.end.col = range.end.col.max(merged.end.col);
            }
        }
        if range == previous {
            return range;
        }
    }
}

pub(crate) fn subtract_merges(rects: Vec<CellRange>, merges: &[CellRange]) -> Vec<CellRange> {
    let mut current = rects;
    for merge in merges {
        let mut next = Vec::with_capacity(current.len());
        for rect in current {
            if !rect.intersects(*merge) {
                next.push(rect);
                continue;
            }
            if rect.start.row < merge.start.row {
                next.push(CellRange::new(
                    rect.start,
                    CellAddress::new(merge.start.row - 1, rect.end.col),
                ));
            }
            if rect.end.row > merge.end.row {
                next.push(CellRange::new(
                    CellAddress::new(merge.end.row + 1, rect.start.col),
                    rect.end,
                ));
            }
            let top = rect.start.row.max(merge.start.row);
            let bottom = rect.end.row.min(merge.end.row);
            if top <= bottom {
                if rect.start.col < merge.start.col {
                    next.push(CellRange::new(
                        CellAddress::new(top, rect.start.col),
                        CellAddress::new(bottom, merge.start.col - 1),
                    ));
                }
                if rect.end.col > merge.end.col {
                    next.push(CellRange::new(
                        CellAddress::new(top, merge.end.col + 1),
                        CellAddress::new(bottom, rect.end.col),
                    ));
                }
            }
        }
        current = next;
    }
    current
}

pub(crate) fn collect_special_matches(
    workbook: &Workbook,
    sheet: usize,
    scope: CellRange,
    origin: CellRange,
    anchor: CellAddress,
    kind: LocateKind,
) -> (Vec<CellRange>, Vec<CellRange>) {
    let Some(source) = workbook.sheet(sheet) else {
        return (Vec::new(), Vec::new());
    };
    let anchor = source.merged_range_at(anchor).map_or(anchor, |m| m.start);
    let raw = match kind {
        LocateKind::Comments => source
            .notes
            .keys()
            .chain(source.comments.keys())
            .copied()
            .filter(|addr| scope.contains(*addr))
            .map(CellRange::single)
            .collect(),
        LocateKind::ConditionalFormat => conditional_rects(workbook, sheet, scope, None),
        LocateKind::ConditionalFormatSame => {
            conditional_rects(workbook, sheet, scope, Some(anchor))
        }
        LocateKind::DataValidation => validation_rects(source, scope, None),
        LocateKind::DataValidationSame => validation_rects(source, scope, Some(anchor)),
        LocateKind::Precedents => trace_precedent_rects(workbook, sheet, origin, false),
        LocateKind::PrecedentsAll => trace_precedent_rects(workbook, sheet, origin, true),
        LocateKind::Dependents => trace_dependent_rects(workbook, sheet, origin, false),
        LocateKind::DependentsAll => trace_dependent_rects(workbook, sheet, origin, true),
        LocateKind::Constants | LocateKind::Formulas | LocateKind::Blanks => Vec::new(),
    };
    let merges = source.merges_in_range(scope);
    let merged_matches = merges
        .iter()
        .copied()
        .filter(|merged| raw.iter().any(|r| r.contains(merged.start)))
        .collect();
    let clipped: Vec<_> = raw.into_iter().filter_map(|r| clip(r, scope)).collect();
    (subtract_merges(clipped, &merges), merged_matches)
}

fn clip(rect: CellRange, bounds: CellRange) -> Option<CellRange> {
    let r = rect.normalize();
    let row_start = r.start.row.max(bounds.start.row);
    let row_end = r.end.row.min(bounds.end.row);
    let col_start = r.start.col.max(bounds.start.col);
    let col_end = r.end.col.min(bounds.end.col);
    (row_start <= row_end && col_start <= col_end)
        .then(|| CellRange::new(CellAddress::new(row_start, col_start), CellAddress::new(row_end, col_end)))
}

fn conditional_rects(
    workbook: &Workbook,
    sheet: usize,
    scope: CellRange,
    same_as: Option<CellAddress>,
) -> Vec<CellRange> {
    let Ok(mut snapshot) = workbook.conditional_format_config(sheet) else {
        return Vec::new();
    };
    snapshot.rules.sort_by(|a, b| (a.priority, &a.id).cmp(&(b.priority, &b.id)));
    let rule_areas: Vec<(Vec<CellRange>, &str)> = snapshot
        .rules
        .iter()
        .map(|rule| {
            let mut areas = vec![CellRange::new(
                CellAddress::new(rule.row_start, rule.col_start),
                CellAddress::new(rule.row_end, rule.col_end),
            )];
            areas.extend(rule.additional_ranges.iter().copied());
            (areas, rule.rule_json.as_str())
        })
        .collect();
    let Some(anchor) = same_as else {
        return rule_areas
            .into_iter()
            .flat_map(|(areas, _)| areas)
            .filter(|area| area.intersects(scope))
            .collect();
    };
    let sig_at = |pt: CellAddress| -> Vec<&str> {
        rule_areas
            .iter()
            .filter(|(areas, _)| areas.iter().any(|a| a.contains(pt)))
            .map(|(_, json)| *json)
            .collect()
    };
    let target_sig = sig_at(anchor);
    if target_sig.is_empty() {
        return Vec::new();
    }
    let mut rows = BTreeSet::from([scope.start.row, scope.end.row + 1]);
    let mut cols = BTreeSet::from([scope.start.col, scope.end.col + 1]);
    for (areas, _) in &rule_areas {
        for area in areas {
            if let Some(c) = clip(*area, scope) {
                rows.extend([c.start.row, c.end.row + 1]);
                cols.extend([c.start.col, c.end.col + 1]);
            }
        }
    }
    let row_cuts: Vec<u32> = rows.into_iter().collect();
    let col_cuts: Vec<u32> = cols.into_iter().collect();
    let mut out = Vec::new();
    for r_win in row_cuts.windows(2) {
        for c_win in col_cuts.windows(2) {
            let sample = CellAddress::new(r_win[0], c_win[0]);
            if sig_at(sample) == target_sig {
                out.push(CellRange::new(
                    sample,
                    CellAddress::new(r_win[1] - 1, c_win[1] - 1),
                ));
            }
        }
    }
    out
}

fn same_validation_rule(a: &DataValidationRule, b: &DataValidationRule) -> bool {
    a.ignore_blank == b.ignore_blank
        && a.operator == b.operator
        && a.options == b.options
        && match (&a.kind, &b.kind) {
            (
                DataValidationKind::CustomFormula { formula: left, .. },
                DataValidationKind::CustomFormula { formula: right, .. },
            ) => left == right,
            (left, right) => left == right,
        }
}

fn validation_rects(
    source: &crate::Sheet,
    scope: CellRange,
    same_as: Option<CellAddress>,
) -> Vec<CellRange> {
    let Some(anchor) = same_as else {
        return source
            .data_validations
            .iter()
            .map(|r| r.range)
            .filter(|r| r.intersects(scope))
            .collect();
    };
    let Some(target) = source
        .data_validations
        .iter()
        .find(|r| r.range.contains(anchor))
        .map(|r| r.rule.as_ref())
    else {
        return Vec::new();
    };
    source
        .data_validations
        .iter()
        .filter(|r| r.range.intersects(scope) && same_validation_rule(&r.rule, target))
        .map(|r| r.range)
        .collect()
}
