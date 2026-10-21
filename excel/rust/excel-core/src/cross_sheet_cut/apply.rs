//! 发布跨表移动的唯一写入边界；校验失败在通知订阅者之前恢复全部 before-image。
use super::super::*;
use crate::{CellStyle, StyleScope};

pub(super) fn move_cells(
    workbook: &mut Workbook,
    snapshot: &ClipboardSnapshot,
    target_sheet: usize,
    range: CellRange,
    planned: Vec<PlannedCell>,
    dependents: &[(usize, CellAddress, String)],
    source_borders: crate::sheet::BorderPlan,
    target_borders: crate::sheet::BorderPlan,
    validation: &[(usize, CellAddress)],
    history: &mut crate::workbook_history::WorkbookHistory,
) -> Result<(), ClipboardError> {
    let source_sheet = snapshot.source_sheet.ok_or("CLIPBOARD_INVALID_SHEET")?;
    // 原生依赖可能跨任意表；只延后已注册监听，不读取或复制整张表。
    let observers: Vec<_> = workbook
        .sheets
        .iter_mut()
        .enumerate()
        .map(|(index, sheet)| (index, sheet.suspend_structure_notifications()))
        .collect();
    let store = workbook.store.clone();
    let mut outcome = Ok(());
    store.batch(|_| {
        workbook.bulk_load(|loader| {
            for addr in snapshot.source.iter() {
                loader.clear_cell_at(source_sheet, addr);
            }
            for (addr, value, _) in &planned {
                match value {
                    Some(ClipboardValue::Formula { source, .. }) => {
                        loader.set_formula_at(target_sheet, *addr, source);
                    }
                    Some(ClipboardValue::Literal(Value::Null)) => {
                        loader.clear_cell_at(target_sheet, *addr)
                    }
                    Some(ClipboardValue::Literal(value)) => {
                        loader.set_cell_at(target_sheet, *addr, value.clone());
                    }
                    None => {}
                }
            }
            for (sheet, addr, text) in dependents {
                loader.set_formula_at(*sheet, *addr, text);
            }
        });
        let source = &mut workbook.sheets[source_sheet];
        source
            .hyperlinks
            .retain(|addr, _| !snapshot.source.contains(*addr));
        source.patch_format_range(
            snapshot.source,
            StyleScope::Cell,
            CellStyle::from_format(CellFormat::default()),
        );
        source.apply_border_plan(source_borders);
        let target = &mut workbook.sheets[target_sheet];
        for (addr, _, format) in planned {
            let (_, source) = snapshot.cell_at_target(addr, range, false);
            if let Some(url) = &source.hyperlink {
                target.hyperlinks.insert(addr, url.clone());
            } else {
                target.hyperlinks.remove(&addr);
            }
            if let Some(format) = format {
                target.patch_format_range(CellRange::single(addr), StyleScope::Cell, format);
            }
        }
        target.apply_border_plan(target_borders);
        for (sheet, addr) in validation {
            workbook.settle_validation_candidate(*sheet, CellRange::single(*addr));
        }
        let valid = validation.iter().try_for_each(|(sheet, addr)| {
            let value =
                crate::sheet::collapse_array_for_eval(workbook.sheets[*sheet].peek_value(*addr));
            workbook.validate_input_value(*sheet, *addr, &value)
        });
        outcome = history.finish(workbook, valid.is_ok()).and(valid);
        if outcome.is_err() {
            for (sheet, addr) in validation {
                workbook.settle_validation_candidate(*sheet, CellRange::single(*addr));
            }
        }
    });
    for (index, observers) in observers {
        workbook.sheets[index].resume_structure_notifications(observers);
    }
    outcome
}
