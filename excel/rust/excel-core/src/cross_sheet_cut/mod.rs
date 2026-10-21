//! 跨表剪切在完整预检后复用多范围历史，原始快照始终只保留在 Rust。
use super::*;

mod apply;
mod rewrite;
pub(super) use rewrite::moved_formula as rewrite_moved_formula;

pub(super) fn paste(
    workbook: &mut Workbook,
    snapshot: &ClipboardSnapshot,
    target_sheet: usize,
    options: &ClipboardPasteOptions,
    history: Option<&mut crate::workbook_history::WorkbookHistory>,
) -> Result<CellRange, ClipboardError> {
    let source_sheet = snapshot.source_sheet.ok_or("CLIPBOARD_INVALID_SHEET")?;
    let source = workbook
        .sheet(source_sheet)
        .ok_or("CLIPBOARD_INVALID_SHEET")?;
    let target = workbook
        .sheet(target_sheet)
        .ok_or("CLIPBOARD_INVALID_SHEET")?;
    // unlocked_ranges 只属于目的表；源表权限始终以原生设置单独检查。
    let target_options = ClipboardPasteOptions {
        selection: options.selection,
        mode: options.mode,
        arithmetic: options.arithmetic,
        transpose: options.transpose,
        skip_blanks: options.skip_blanks,
        row_count: options.row_count,
        col_count: options.col_count,
        unlocked_ranges: None,
    };
    let range = snapshot.paste_target(
        &target_options,
        merge::logical_target(snapshot, target, options),
    )?;
    if let Some(unlocked) = &options.unlocked_ranges {
        if !range
            .iter()
            .all(|addr| unlocked.iter().any(|allowed| allowed.contains(addr)))
        {
            return Err("CLIPBOARD_LOCKED");
        }
    }
    workbook.ensure_range_editable(source_sheet, snapshot.source)?;
    workbook.ensure_range_editable(target_sheet, range)?;
    // 命名范围由稳定工作表标识解析；尚无跨表移动定义/历史契约，不能留在清空的源格。
    // 只拒绝当前有效且与源区相交的 Range，不影响值、表达式、局部名称或失效定义。
    if workbook.snapshot_named_ranges().into_iter().any(|entry| {
        entry.target.is_some_and(|(sheet, named_range)| {
            sheet == source_sheet && named_range.intersects(snapshot.source)
        })
    }) {
        return Err("CLIPBOARD_CROSS_SHEET_NAMED_RANGE");
    }
    // 跨表合并布局和 Table 结构尚无移动契约；拒绝前不改内容、历史或快照。
    if !snapshot.merges.is_empty()
        || !source.merges_in_range(snapshot.source).is_empty()
        || !target.merges_in_range(range).is_empty()
    {
        return Err("CLIPBOARD_CROSS_SHEET_MERGE");
    }
    if workbook.tables.values().any(|table| {
        (Some(table.sheet_name()) == workbook.name(source_sheet)
            && table.range().intersects(snapshot.source))
            || (Some(table.sheet_name()) == workbook.name(target_sheet)
                && table.range().intersects(range))
    }) {
        return Err("CLIPBOARD_CROSS_SHEET_TABLE");
    }
    if source.filter_hidden_set().is_some_and(|rows| {
        rows.range(snapshot.source.start.row..=snapshot.source.end.row)
            .next()
            .is_some()
    }) {
        return Err("CLIPBOARD_FILTERED_CUT");
    }
    for (addr, original) in snapshot.source.iter().zip(&snapshot.cells) {
        let current = read_cell(source, addr);
        let input_unchanged = match (&current.value, &original.value) {
            (
                ClipboardValue::Formula { source: a, .. },
                ClipboardValue::Formula { source: b, .. },
            ) => a == b,
            (a, b) => a == b,
        };
        if source.is_spill_region(addr)
            || current.format != original.format
            || current.hyperlink != original.hyperlink
            || !input_unchanged
        {
            return Err("CLIPBOARD_CUT_SOURCE_CHANGED");
        }
    }
    let merges =
        merge::MergePastePlan::prepare(workbook, snapshot, target_sheet, options, range, false)?;
    let planned =
        paste_values::plan_cells(workbook, snapshot, target_sheet, range, options, &merges)?;
    let dependents = rewrite::dependent_writes(workbook, snapshot, target_sheet, range)?;
    let mut validation: Vec<_> =
        paste_values::validate_inputs(workbook, target_sheet, options.mode, &planned)?
            .into_iter()
            .map(|addr| (target_sheet, addr))
            .collect();
    for (sheet, addr, _) in &dependents {
        workbook.ensure_range_editable(*sheet, CellRange::single(*addr))?;
        if workbook.sheets[*sheet].data_validation_at(*addr).is_some() {
            validation.push((*sheet, *addr));
        }
    }
    let source_borders = source.plan_replacement_borders(
        snapshot
            .source
            .iter()
            .map(|addr| (addr, crate::CellBorders::default())),
        source.merged_ranges(),
    );
    let target_borders = target.plan_replacement_borders(
        planned
            .iter()
            .filter_map(|(addr, _, format)| Some((*addr, format.as_ref()?.borders.clone()?))),
        target.merged_ranges(),
    );
    let mut targets = vec![
        (source_sheet, snapshot.source, true),
        (target_sheet, range, true),
    ];
    targets.extend(
        dependents
            .iter()
            .map(|(sheet, addr, _)| (*sheet, CellRange::single(*addr), true)),
    );
    for (sheet, borders) in [
        (source_sheet, &source_borders),
        (target_sheet, &target_borders),
    ] {
        for addr in borders.keys() {
            workbook.ensure_range_editable(sheet, CellRange::single(*addr))?;
        }
        targets.extend(
            crate::sheet::border_plan_ranges(borders)
                .into_iter()
                .map(|range| (sheet, range, false)),
        );
    }
    // 未提供宿主历史时也用同一事务回滚验证失败；成功后临时历史自然释放。
    let mut temporary = crate::workbook_history::WorkbookHistory::default();
    let history = history.unwrap_or(&mut temporary);
    history.begin_ranges(workbook, target_sheet, range, "Move cells", &targets, false)?;
    apply::move_cells(
        workbook,
        snapshot,
        target_sheet,
        range,
        planned,
        &dependents,
        source_borders,
        target_borders,
        &validation,
        history,
    )?;
    Ok(range)
}
