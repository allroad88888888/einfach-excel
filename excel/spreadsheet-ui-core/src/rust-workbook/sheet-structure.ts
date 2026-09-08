import type { RustWorkbookCommands, RustWorkbookSheet } from './commands'
import type { WasmWorkbook } from './wasm-types'

/** Rust 执行结构变更后重排 ID→索引；稳定 ID 不随标签位置变化。 */
export function changeSheetStructure(
  workbook: WasmWorkbook,
  sheetsById: Map<string, RustWorkbookSheet>,
  input: RustWorkbookCommands['workbook.changeSheets']['payload'],
): readonly RustWorkbookSheet[] {
  const source = sheetsById.get(input.sheetId)
  if (!source) throw new Error('The worksheet no longer exists.')
  if (input.projection && !sheetsById.has(input.projection.sheetId)) {
    throw new Error('The visible worksheet no longer exists.')
  }
  const ordered = [...sheetsById.values()].sort((left, right) => left.index - right.index)
  if (input.operation === 'delete') {
    if (ordered.length <= 1) throw new Error('Keep at least one worksheet.')
    if (input.projection?.sheetId === input.sheetId) {
      throw new Error('Cannot read the worksheet being deleted.')
    }
    if (!workbook.remove_sheet(source.index)) throw new Error('Could not delete the worksheet.')
    ordered.splice(source.index, 1)
  } else {
    if (
      !Number.isSafeInteger(input.targetIndex) ||
      input.targetIndex < 0 ||
      input.targetIndex >= ordered.length
    ) {
      throw new Error('The requested worksheet position is outside the workbook.')
    }
    if (!workbook.move_sheet(source.index, input.targetIndex))
      throw new Error('Could not move the worksheet.')
    ordered.splice(source.index, 1)
    ordered.splice(input.targetIndex, 0, source)
  }
  const sheets = ordered.map((sheet, index) =>
    Object.freeze({ ...sheet, index, name: workbook.sheet_name(index) }),
  )
  sheetsById.clear()
  for (const sheet of sheets) sheetsById.set(sheet.id, sheet)
  return sheets
}
