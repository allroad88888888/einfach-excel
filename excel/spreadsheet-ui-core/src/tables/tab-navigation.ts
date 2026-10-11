import { atom, type Getter, type Setter } from '@einfach/core'
import { keyboardModeAtom, lastKeyboardIntentAtom, type KeyboardCommandIntent, type KeyboardInput } from '../keyboard'
import { applyKeyboardMove } from '../keyboard/apply-keyboard-move'
import { selectionAtom, selectionRegionsAtom, selectionAuthorityWitnessAtom } from '../selection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { projectionSnapshotAtom } from '../projection'
import { parseA1Range } from '../name-box/address'
import { sheetHiddenRowsBackingAtom, viewportHiddenColsBackingAtom,
  viewportFilterHiddenBackingAtom } from '../viewport/hidden-state'
import { nativeOutlineProjectionBackingAtom } from '../outline/native-state'
import type { CellCoord } from '../shared'
import { changeNativeTableAtom } from './native-change'
import { nativeTableFeedbackAtom } from './native-feedback'

function hiddenAxes(get: Getter, sheetId: string) {
  const outline = get(nativeOutlineProjectionBackingAtom)[sheetId]
  return {
    rows: new Set([...(get(sheetHiddenRowsBackingAtom)[sheetId] ?? []),
      ...(get(viewportFilterHiddenBackingAtom).rowsBySheet[sheetId] ?? []),
      ...(outline?.outlineRows ?? [])]),
    cols: new Set([...(get(viewportHiddenColsBackingAtom)[sheetId] ?? []),
      ...(outline?.outlineColumns ?? [])]),
  }
}

function move(get: Getter, set: Setter, sheetId: string, from: CellCoord, to: CellCoord) {
  const intent: KeyboardCommandIntent = { type: 'selection.move', key: 'Tab', reason: 'tab',
    extend: false, from, to, scroll: { type: 'viewport.scrollToCell', target: to },
    selection: { kind: 'cell', sheetId, anchor: to, focus: to } }
  applyKeyboardMove(get, set, intent)
  set(lastKeyboardIntentAtom, intent)
  return intent
}

/** Rust 确认追加后才定位；等待期间用户已换选区，则保留用户的新位置。 */
const appendFromKeyboardAtom = atom(null, async (get, set, name: string) => {
  const selection = get(selectionAtom)
  if (selection.kind !== 'cell') return
  const witness = get(selectionAuthorityWitnessAtom)
  const projection = await set(changeNativeTableAtom, { kind: 'append-row', name })
  if (!projection || get(selectionAuthorityWitnessAtom) !== witness ||
    get(activeWorkbookSheetAtom)?.id !== selection.sheetId) return
  const table = projection.tables?.find((entry) => entry.name === name)
  const range = table && parseA1Range(table.range)
  if (!range || !table) return
  const row = range.rowEnd - Number(table.hasTotals)
  const hidden = hiddenAxes(get, selection.sheetId)
  const sheet = get(activeWorkbookSheetAtom)!
  // 行高/隐藏属于整行，局部插行不改它们；不能把选区放进不可见行。
  let targetRow = row
  while (targetRow < sheet.rowCount && hidden.rows.has(targetRow)) targetRow++
  let col = range.colStart
  while (col <= range.colEnd && hidden.cols.has(col)) col++
  if (targetRow < sheet.rowCount && col <= range.colEnd)
    move(get, set, selection.sheetId, selection.focus, { row: targetRow, col })
})

/** 只接管 Table 数据区的单格 Tab；编辑提交、IME、多区仍走原键盘规则。 */
export const dispatchTableTabAtom = atom(null, (get, set,
  input: KeyboardInput & { allowAppend?: boolean },
): KeyboardCommandIntent | null => {
  if (input.key !== 'Tab' || input.isComposing || input.ctrlKey || input.metaKey || input.altKey ||
    get(keyboardModeAtom) !== 'navigation') return null
  const blocked: KeyboardCommandIntent = { type: 'none', reason: 'editing-text-navigation' }
  if (get(nativeTableFeedbackAtom).busy) return blocked
  const selection = get(selectionAtom)
  if (selection.kind !== 'cell' || get(selectionRegionsAtom).length !== 1) return null
  const sheet = get(activeWorkbookSheetAtom)
  const snapshot = get(projectionSnapshotAtom)
  const result = snapshot.result
  if (!sheet || selection.sheetId !== sheet.id || snapshot.status !== 'ready' ||
    result?.kind !== 'visible-window' || result.sheetId !== sheet.id) return null
  const from = selection.focus
  const table = result.tables?.find((entry) => {
    const range = parseA1Range(entry.range)
    return entry.sheetIndex === sheet.index && range && from.col >= range.colStart &&
      from.col <= range.colEnd && from.row >= range.rowStart + Number(entry.hasHeaders) &&
      from.row <= range.rowEnd - Number(entry.hasTotals)
  })
  if (!table) return null
  const range = parseA1Range(table.range)!
  const hidden = hiddenAxes(get, sheet.id)
  const direction = input.shiftKey ? -1 : 1
  let col = from.col + direction
  while (col >= range.colStart && col <= range.colEnd && hidden.cols.has(col)) col += direction
  if (col >= range.colStart && col <= range.colEnd)
    return move(get, set, sheet.id, from, { row: from.row, col })
  let row = from.row + direction
  const first = range.rowStart + Number(table.hasHeaders)
  const last = range.rowEnd - Number(table.hasTotals)
  while (row >= first && row <= last && hidden.rows.has(row)) row += direction
  col = direction > 0 ? range.colStart : range.colEnd
  while (col >= range.colStart && col <= range.colEnd && hidden.cols.has(col)) col += direction
  if (col < range.colStart || col > range.colEnd) return blocked
  if (row >= first && row <= last) return move(get, set, sheet.id, from, { row, col })
  // 反向到首格就恢复普通 Shift+Tab；前向只在真正的末记录追加，过滤掉的尾行不制造新记录。
  if (direction < 0 || from.row !== last) return null
  if (input.allowAppend === false) return blocked
  const intent: KeyboardCommandIntent = { type: 'table.append-row', name: table.name }
  set(lastKeyboardIntentAtom, intent)
  void set(appendFromKeyboardAtom, table.name)
  return intent
})
