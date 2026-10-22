import type { HostControls } from './types'

export const DEFAULT_HOST_CONTROLS: HostControls = Object.freeze({
  readOnly: false, busy: false, allowSheetStructure: true,
})

// 白名单只读命令；新命令默认视作持久写入，防止新增功能旁路宿主策略。
const NON_PERSISTENT = new Set([
  'host.configure', 'host.readRanges', 'workbook.initialize', 'workbook.openFile',
  'workbook.importCells', 'formula.catalog', 'formula.awaitAsync', 'formula.recalculate',
  'customFormula.read', 'notes.read', 'comments.read', 'protection.read', 'formula.inspectSpill',
  'workbook.exportFile', 'validation.read', 'formula.suggest', 'duplicates.preview',
  'textColumns.preview', 'format.preview', 'sheet.filterValues', 'selection.aggregate',
  'workbook.locate', 'workbook.find', 'clipboard.export', 'clipboard.capture',
  'clipboard.finishCapture', 'projection.readVisible',
])
const STRUCTURAL = new Set(['sheet.editStructure', 'workbook.changeSheets', 'workbook.editSheet'])
export const isPersistentHostCommand = (command: string): boolean => !NON_PERSISTENT.has(command)

export function validateHostControls(input: HostControls): HostControls {
  if (typeof input?.readOnly !== 'boolean' || typeof input.busy !== 'boolean' ||
      typeof input.allowSheetStructure !== 'boolean') throw new Error('Invalid host controls.')
  return Object.freeze({ readOnly: input.readOnly, busy: input.busy,
    allowSheetStructure: input.allowSheetStructure })
}

export function assertHostCommandAllowed(controls: HostControls, command: string): void {
  if (NON_PERSISTENT.has(command)) return
  const code = controls.readOnly ? 'HOST_READ_ONLY' :
    controls.busy && command !== 'host.writeCells' ? 'HOST_BUSY' :
    !controls.allowSheetStructure && STRUCTURAL.has(command) ? 'HOST_STRUCTURE_DISABLED' : null
  if (code) throw Object.assign(new Error(code), { code })
}
