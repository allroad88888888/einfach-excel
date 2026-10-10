import type { RustConditionalFormatCommands } from './conditional-format-commands'
import type { WasmWorkbook } from './wasm-types'

/** 只校验传输目标与演示画布；条件、样式、版本检查及历史全由 Rust 执行。 */
export function changeConditionalFormat(
  workbook: WasmWorkbook,
  sheet: number,
  input: RustConditionalFormatCommands['conditionalFormat.change']['payload'],
  rows: number,
  cols: number,
): void {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (!Number.isSafeInteger(input.revision) || input.revision < 0)
    throw new Error('Invalid conditional-format revision.')
  if (
    !workbook.setConditionalFormatRule ||
    !workbook.removeConditionalFormatRule ||
    !workbook.listConditionalFormats ||
    !workbook.snapshot_display_format_range ||
    !workbook.history_state
  )
    throw new Error('Rust conditional formatting is unavailable.')
  if (input.action === 'remove') {
    workbook.removeConditionalFormatRule(sheet, { revision: input.revision, ruleId: input.ruleId })
    return
  }
  if (input.action === 'duplicate' || input.action === 'enable' || input.action === 'disable'
    || input.action === 'move-up' || input.action === 'move-down') {
    if (!workbook.manageConditionalFormatRule)
      throw new Error('Rust conditional-format rule management is unavailable.')
    const { action, revision, ruleId } = input
    workbook.manageConditionalFormatRule(sheet, { action, revision, ruleId })
    return
  }
  if (input.action !== 'set') throw new Error('Choose a supported conditional-format action.')
  const { rowStart, rowEnd, colStart, colEnd } = input.scope.range
  if (
    ![rowStart, rowEnd, colStart, colEnd].every(Number.isSafeInteger) ||
    rowStart < 0 ||
    colStart < 0 ||
    rowEnd < rowStart ||
    colEnd < colStart ||
    rowEnd >= rows ||
    colEnd >= cols
  )
    throw new Error('Choose a conditional-format range inside the worksheet.')
  workbook.setConditionalFormatRule(sheet, {
    revision: input.revision,
    ruleId: input.ruleId,
    scope: input.scope,
    priority: input.priority,
    rule: input.rule,
  })
}
