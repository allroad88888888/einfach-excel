//! 定位条件依赖追踪收集器：引用单元格与从属单元格（仅直接 / 所有级别）。
use crate::{CellAddress, CellRange, Workbook};
use std::collections::{HashSet, VecDeque};

pub(super) fn trace_precedent_rects(
    workbook: &Workbook,
    sheet: usize,
    origin: CellRange,
    all_levels: bool,
) -> Vec<CellRange> {
    let Some(source) = workbook.sheet(sheet) else {
        return Vec::new();
    };
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();
    for addr in source.formula_addrs_in_range(origin) {
        if visited.insert((sheet, addr)) {
            queue.push_back((sheet, addr));
        }
    }
    if origin.start == origin.end && queue.is_empty() && visited.insert((sheet, origin.start)) {
        queue.push_back((sheet, origin.start));
    }
    let mut out = Vec::new();
    while let Some((cur_sheet, cur_addr)) = queue.pop_front() {
        for item in workbook.trace_precedents(cur_sheet, cur_addr) {
            if item.sheet_index == sheet {
                out.push(item.range);
            }
            if !all_levels {
                continue;
            }
            let Some(target_sheet) = workbook.sheet(item.sheet_index) else {
                continue;
            };
            for next in target_sheet.formula_addrs_in_range(item.range) {
                if visited.insert((item.sheet_index, next)) {
                    queue.push_back((item.sheet_index, next));
                }
            }
            for &anchor in target_sheet.spill_anchor_addr.values() {
                if let Some((rows, cols)) = target_sheet.spill_info(anchor) {
                    if rows > 0 && cols > 0 {
                        let spill = CellRange::new(
                            anchor,
                            CellAddress::new(anchor.row + rows - 1, anchor.col + cols - 1),
                        );
                        if spill.intersects(item.range) && visited.insert((item.sheet_index, anchor))
                        {
                            queue.push_back((item.sheet_index, anchor));
                        }
                    }
                }
            }
        }
    }
    out
}

pub(super) fn trace_dependent_rects(
    workbook: &Workbook,
    sheet: usize,
    origin: CellRange,
    all_levels: bool,
) -> Vec<CellRange> {
    let full = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1_048_575, 16_383));
    let mut formulas = Vec::new();
    for idx in 0..workbook.sheet_count() {
        let Some(s) = workbook.sheet(idx) else { continue };
        for addr in s.formula_addrs_in_range(full) {
            let precs: Vec<(usize, CellRange)> = workbook
                .trace_precedents(idx, addr)
                .into_iter()
                .map(|p| (p.sheet_index, p.range))
                .collect();
            if !precs.is_empty() {
                formulas.push((idx, addr, precs));
            }
        }
    }
    let spill_or_cell = |s_idx: usize, addr: CellAddress| -> CellRange {
        workbook
            .sheet(s_idx)
            .and_then(|s| s.spill_info(addr))
            .filter(|&(r, c)| r > 0 && c > 0)
            .map(|(r, c)| {
                CellRange::new(
                    addr,
                    CellAddress::new(
                        addr.row.saturating_add(r - 1).min(1_048_575),
                        addr.col.saturating_add(c - 1).min(16_383),
                    ),
                )
            })
            .unwrap_or_else(|| CellRange::single(addr))
    };
    let mut queue = VecDeque::new();
    let mut visited = HashSet::new();
    queue.push_back((sheet, origin));
    if origin.start == origin.end {
        visited.insert((sheet, origin.start));
        let expanded = spill_or_cell(sheet, origin.start);
        if expanded != origin {
            queue.push_back((sheet, expanded));
        }
    }
    let mut out = Vec::new();
    while let Some((target_sheet, target_rect)) = queue.pop_front() {
        for &(dep_sheet, dep_addr, ref precs) in &formulas {
            if visited.contains(&(dep_sheet, dep_addr)) {
                continue;
            }
            if dep_sheet == sheet
                && origin.contains(dep_addr)
                && target_sheet == sheet
                && target_rect == origin
                && origin.start == origin.end
            {
                continue;
            }
            if precs
                .iter()
                .any(|(s, r)| *s == target_sheet && r.intersects(target_rect))
            {
                visited.insert((dep_sheet, dep_addr));
                if dep_sheet == sheet {
                    out.push(CellRange::single(dep_addr));
                }
                if all_levels {
                    queue.push_back((dep_sheet, spill_or_cell(dep_sheet, dep_addr)));
                }
            }
        }
    }
    out
}
