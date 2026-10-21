import type { RustWorkbookSheet, RustWorkbookSheetInput } from './commands'
import { importSheetSizes } from './size-io'
import { importSheetVisibility } from './visibility-io'
import { importSheetOutline } from './outline-io'
import type { RustWasmModule, WasmWorkbook } from './wasm-types'
import type { NativeCustomFormulaDefinition } from '../custom-formulas/expression-types'

/** WASM 加载后创建唯一工作簿，导入演示页提供的初始元数据。 */
export function initializeWorkbook(
  wasm: RustWasmModule,
  sheets: readonly RustWorkbookSheetInput[],
  customFormulas: readonly NativeCustomFormulaDefinition[] = [],
): { workbook: WasmWorkbook; sheets: RustWorkbookSheet[] } {
  const inputs = sheets.length > 0 ? sheets : [{ name: 'Sheet1' }]
  const workbook = new wasm.WasmWorkbook() as WasmWorkbook
  workbook.rename_sheet(0, inputs[0]?.name ?? 'Sheet1')
  for (const input of inputs.slice(1)) workbook.add_sheet(input.name)
  // 工作簿级定义先于所有导入公式；仍走原生历史入口，启动末尾统一清空。
  for (const definition of customFormulas) {
    if (!workbook.change_custom_formula) throw new Error('Rust custom formula editing is unavailable.')
    workbook.change_custom_formula(0, JSON.stringify({ kind: 'upsert', definition }))
  }
  inputs.forEach((input, index) => importSheetSizes(workbook, index, input))
  inputs.forEach((input, index) => importSheetVisibility(workbook, index, input))
  inputs.forEach((input, index) => importSheetOutline(workbook, index, input))
  // 初始矩形只写 Rust；后续导入锚点内容，启动历史不暴露为用户操作。
  inputs.forEach((input, index) => {
    for (const link of input.hyperlinks ?? []) {
      if (!workbook.change_hyperlink) throw new Error('Rust hyperlink editing is unavailable.')
      workbook.change_hyperlink(index, link.row, link.col, link.url)
    }
    for (const note of input.notes ?? []) {
      if (!workbook.change_note) throw new Error('Rust note editing is unavailable.')
      workbook.change_note(index, note.row, note.col, note.text)
    }
    for (const comment of input.comments ?? []) {
      if (!workbook.change_comment) throw new Error('Rust comment editing is unavailable.')
      workbook.change_comment(index, comment.row, comment.col, JSON.stringify({
        action: 'create', author: comment.author, body: comment.body,
      }))
    }
    // 先建立原生名称，后续导入公式直接解析；初始化末尾统一清除历史。
    for (const { name, range } of input.namedRanges ?? []) {
      if (!workbook.change_named_range) throw new Error('Rust named ranges are unavailable.')
      workbook.change_named_range(index, { kind: 'create', name,
        target: { sheet: index,
          range: [range.rowStart, range.colStart, range.rowEnd, range.colEnd] } })
    }
    for (const { range, rule } of input.dataValidations ?? []) {
      if (!workbook.setDataValidation) throw new Error('Rust data validation is unavailable.')
      workbook.setDataValidation(
        index, range.rowStart, range.colStart, range.rowEnd, range.colEnd, rule)
    }
    let revision = 0
    for (const rule of input.conditionalFormats ?? []) {
      if (!workbook.setConditionalFormatRule)
        throw new Error('Rust conditional formatting is unavailable.')
      const result = workbook.setConditionalFormatRule(index, { ...rule, revision, priority: 0 })
      revision = result.revision
    }
    if (input.freeze) {
      const { rows, cols } = input.freeze
      if (![rows, cols].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        rows >= (input.rowCount ?? 1_048_576) || cols >= (input.colCount ?? 16_384))
        throw new Error('Invalid initial freeze boundary.')
      if (!workbook.set_frozen_panes) throw new Error('Rust freeze command is unavailable.')
      workbook.set_frozen_panes(index, rows, cols)
    }
    for (const range of input.mergedRanges ?? []) {
      if (!workbook.merge_cells) throw new Error('Rust merge command is unavailable.')
      workbook.merge_cells(
        index,
        range.rowStart,
        range.colStart,
        range.rowEnd,
        range.colEnd,
        'merge',
        false,
      )
    }
    for (const range of input.editableRanges ?? []) {
      if (!workbook.change_protection) throw new Error('Rust worksheet protection is unavailable.')
      workbook.change_protection(index, { action: 'allow-range', range })
    }
  })
  workbook.history_clear?.('')
  return {
    workbook,
    sheets: inputs.map((input, index) =>
      Object.freeze({
        id: input.id ?? `sheet-${index + 1}`,
        index,
        name: workbook.sheet_name(index),
        ...(workbook.sheet_key ? { key: workbook.sheet_key(index) } : {}),
        ...(input.rowCount ? { rowCount: input.rowCount, colCount: input.colCount } : {}),
      }),
    ),
  }
}
