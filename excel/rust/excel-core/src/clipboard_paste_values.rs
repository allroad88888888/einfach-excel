//! 将剪贴板值、公式及格式转换为预检后的写入计划，不修改工作簿。
use super::*;
use crate::{parse_formula, render_formula, CellStyle};

pub(super) type PlannedCell = (CellAddress, Option<ClipboardValue>, Option<CellStyle>);

pub(super) fn plan_cells(
    workbook: &Workbook,
    snapshot: &ClipboardSnapshot,
    sheet_idx: usize,
    range: CellRange,
    options: &ClipboardPasteOptions,
    merges: &merge::MergePastePlan,
) -> Result<Vec<PlannedCell>, ClipboardError> {
    let sheet = workbook.sheet(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
    let mut planned = Vec::with_capacity(range.cell_count() as usize);
    let mut formula_bytes = 0usize;
    for addr in range.iter() {
        let (origin, cell) = snapshot.cell_at_target(addr, range, options.transpose);
        // 空白源格不写值，也不覆盖目标格式；它对应的 spill 结果同样不受影响。
        if options.skip_blanks && cell.is_blank() {
            continue;
        }
        let covered = merges.covered(sheet, addr);
        if covered
            && options.mode != ClipboardPasteMode::Formats
            && !merges.scalar
            && !cell.is_blank()
        {
            return Err("CLIPBOARD_MERGE_CONTENT");
        }
        if options.mode != ClipboardPasteMode::Formats && sheet.is_spill_region(addr) {
            return Err("CLIPBOARD_SPILL_TARGET");
        }
        let value = if covered && merges.scalar {
            None
        } else {
            match options.mode {
                ClipboardPasteMode::Formats | ClipboardPasteMode::ColumnWidths => None,
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
                                workbook.name(sheet_idx).unwrap(),
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
            }
        };
        let value = if covered || options.arithmetic == ClipboardArithmetic::None {
            value
        } else {
            // 目标公式只取源文本，不为组合表达式额外计算一次结果或读取样式。
            let target = match sheet.formula_text_at(addr) {
                Some(source) => ClipboardValue::Formula {
                    source,
                    evaluated: None,
                },
                None => ClipboardValue::Literal(sheet.peek_value(addr)),
            };
            value
                .map(|value| options.arithmetic.combine(target, value))
                .transpose()?
        };
        if let Some(ClipboardValue::Formula { source, .. }) = &value {
            formula_bytes = formula_bytes.saturating_add(source.len());
            if formula_bytes > MAX_CLIPBOARD_TEXT_BYTES {
                return Err("CLIPBOARD_TOO_LARGE");
            }
        }
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
    Ok(planned)
}
