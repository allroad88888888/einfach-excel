//! 粘贴事务：完整预检后再一次写入，重叠剪切先清源再落目标。

use super::*;
use crate::{parse_formula, render_formula, CellStyle, StyleScope};

impl Workbook {
    pub fn paste_clipboard(
        &mut self,
        snapshot: &ClipboardSnapshot,
        sheet_idx: usize,
        options: &ClipboardPasteOptions,
    ) -> Result<CellRange, ClipboardError> {
        if self.is_inside_custom_call() {
            return Err("CLIPBOARD_MUTATION_DURING_CUSTOM_CALL");
        }
        let range = snapshot.paste_target(options)?;
        let sheet = self.sheet(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
        if snapshot.cut {
            if snapshot.source_sheet != Some(sheet_idx) {
                return Err("CLIPBOARD_CROSS_SHEET_CUT");
            }
            for (addr, original) in snapshot.source.iter().zip(&snapshot.cells) {
                let current = read_cell(sheet, addr);
                if sheet.is_spill_region(addr)
                    || current.format != original.format
                    || !same_input(&current.value, &original.value)
                {
                    return Err("CLIPBOARD_CUT_SOURCE_CHANGED");
                }
            }
        }
        let mut planned = Vec::with_capacity(range.cell_count() as usize);
        for addr in range.iter() {
            let (origin, cell) = snapshot.cell_at_target(addr, range, options.transpose);
            // 空白源格不写值，也不覆盖目标格式；它对应的 spill 结果同样不受影响。
            if options.skip_blanks && cell.is_blank() {
                continue;
            }
            if options.mode != ClipboardPasteMode::Formats && sheet.is_spill_region(addr) {
                return Err("CLIPBOARD_SPILL_TARGET");
            }
            let value = match options.mode {
                ClipboardPasteMode::Formats => None,
                ClipboardPasteMode::Values
                | ClipboardPasteMode::ValuesAndFormats
                | ClipboardPasteMode::ValuesAndNumberFormats => {
                    Some(ClipboardValue::Literal(match &cell.value {
                        ClipboardValue::Formula { source, evaluated } => evaluated
                            .clone()
                            .unwrap_or_else(|| Value::Text(source.clone())),
                        ClipboardValue::Literal(value) => value.clone(),
                    }))
                }
                ClipboardPasteMode::All
                | ClipboardPasteMode::Formulas
                | ClipboardPasteMode::FormulasAndNumberFormats => Some(match &cell.value {
                    ClipboardValue::Formula { source, .. } => {
                        let mut expr = parse_formula(source).ok_or("CLIPBOARD_INVALID_FORMULA")?;
                        let original = expr.clone();
                        if snapshot.cut {
                            move_refs::rewrite(
                                &mut expr,
                                true,
                                self.name(sheet_idx).unwrap(),
                                snapshot.source,
                                range.start,
                            )?;
                        } else if snapshot.source_sheet.is_some() {
                            // 每个平铺格相对自己的源格平移，而不是整个选区共用一次偏移。
                            expr = crate::shift::shift_copy_formula(
                                &expr,
                                i64::from(addr.row) - i64::from(origin.row),
                                i64::from(addr.col) - i64::from(origin.col),
                            )
                            .map_err(|_| "CLIPBOARD_UNSUPPORTED_FORMULA")?;
                        }
                        ClipboardValue::Formula {
                            source: if expr == original {
                                source.clone()
                            } else {
                                render_formula(&expr)
                            },
                            evaluated: None,
                        }
                    }
                    other => other.clone(),
                }),
            };
            let format = match options.mode {
                ClipboardPasteMode::Values | ClipboardPasteMode::Formulas => None,
                ClipboardPasteMode::FormulasAndNumberFormats
                | ClipboardPasteMode::ValuesAndNumberFormats => {
                    // 只补数字格式，不把源字体/颜色或默认值盖到目标行列样式上。
                    cell.format.as_ref().map(|format| CellStyle {
                        number_format: Some(format.number_format.clone()),
                        ..Default::default()
                    })
                }
                _ => cell.format.clone().map(CellStyle::from_format),
            };
            planned.push((addr, value, format));
        }
        let dependents = if snapshot.cut {
            move_refs::dependent_writes(self, sheet_idx, snapshot.source, range)?
        } else {
            Vec::new()
        };

        // 从这里开始不再返回预检错误；仅格式粘贴完全不进入值写入/公式计算链路。
        if options.mode != ClipboardPasteMode::Formats {
            self.bulk_load(|loader| {
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
                for (sheet, addr, text) in &dependents {
                    loader.set_formula_at(*sheet, *addr, text);
                }
            });
        }
        let sheet = self.sheet_mut(sheet_idx).unwrap();
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
        Ok(range)
    }
}

/// 剪切预检比较输入，不把依赖变化导致的公式结果更新误判为源格被改。
fn same_input(current: &ClipboardValue, original: &ClipboardValue) -> bool {
    match (current, original) {
        (ClipboardValue::Formula { source: a, .. }, ClipboardValue::Formula { source: b, .. }) => {
            a == b
        }
        _ => current == original,
    }
}
