//! 将预检后的剪贴板计划作为一个原生事务发布，订阅者不观察中间状态。
use super::*;
use crate::{CellStyle, StyleScope};

pub(super) fn apply_paste(
    workbook: &mut Workbook,
    snapshot: &ClipboardSnapshot,
    sheet_idx: usize,
    options: &ClipboardPasteOptions,
    planned: Vec<paste_values::PlannedCell>,
    dependents: &[(usize, CellAddress, String)],
    merges: &merge::MergePastePlan,
) {
    let indices: std::collections::BTreeSet<_> = std::iter::once(sheet_idx)
        .chain(dependents.iter().map(|(sheet, _, _)| *sheet))
        .collect();
    let observers: Vec<_> = indices
        .iter()
        .map(|index| {
            (
                *index,
                workbook.sheets[*index].suspend_structure_notifications(),
            )
        })
        .collect();
    let store = workbook.store.clone();
    store.batch(|_| {
        let mut anchors = Vec::new();
        if merges.changed() {
            let sheet = &mut workbook.sheets[sheet_idx];
            anchors = sheet.teardown_blocked_spill_anchors();
            merges.apply(sheet);
        }
        // 从这里开始不再返回预检错误；仅格式粘贴完全不进入值写入/公式计算链路。
        if options.mode != ClipboardPasteMode::Formats {
            workbook.bulk_load(|loader| {
                if snapshot.cut {
                    for addr in snapshot.source.iter() {
                        loader.clear_cell_at(sheet_idx, addr);
                    }
                }
                for (addr, value, _) in &planned {
                    match value {
                        Some(ClipboardValue::Formula { source, .. }) => {
                            loader.set_formula_at(sheet_idx, *addr, source);
                        }
                        Some(ClipboardValue::Literal(Value::Null)) => {
                            loader.clear_cell_at(sheet_idx, *addr)
                        }
                        Some(ClipboardValue::Literal(value)) => {
                            loader.set_cell_at(sheet_idx, *addr, value.clone())
                        }
                        None => {}
                    }
                }
                for (sheet, addr, text) in dependents {
                    loader.set_formula_at(*sheet, *addr, text);
                }
            });
        }
        let sheet = workbook.sheet_mut(sheet_idx).unwrap();
        if snapshot.cut {
            sheet.patch_format_range(
                snapshot.source,
                StyleScope::Cell,
                CellStyle::from_format(CellFormat::default()),
            );
        }
        for (addr, _, format) in planned {
            if let Some(format) = format {
                // 默认格式也要压住目标原有的行/列样式。
                sheet.patch_format_range(CellRange::single(addr), StyleScope::Cell, format);
            }
        }
        if merges.changed() {
            sheet.project_bulk_spill_anchors(anchors);
        }
    });
    for (index, observers) in observers {
        workbook.sheets[index].resume_structure_notifications(observers);
    }
}
