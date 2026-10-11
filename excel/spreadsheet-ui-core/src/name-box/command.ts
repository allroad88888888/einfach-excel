import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionRegionsAtom, selectionSnapshotAtom, selectCellAtom, setSelectionAtom } from '../selection'
import { nativeNamedRangesAtom, resolveNativeNamedRange } from '../named-ranges/native-catalog'
import { changeNativeNamedRangeAtom, nativeNameChangeBusyAtom } from '../named-ranges/native-command'
import { parseA1Cell, parseA1Range } from './address'
import { nameBoxErrorMessageAtom, nameBoxInputAtom, nameBoxModeAtom, nameBoxSessionIdAtom } from './state'
import type { NameBoxCommitInput, NameBoxCommitTarget } from './types'

/** 地址定位同步完成；只有创建名称需要等待 Rust，不经过旧 registry/port。 */
export const commitNameBoxAtom = atom(null, (get, set,
  input: NameBoxCommitInput,
): NameBoxCommitTarget | Promise<NameBoxCommitTarget> => {
  const sessionId = get(nameBoxSessionIdAtom)
  if (input.sessionId !== undefined && input.sessionId !== sessionId)
    return { kind: 'invalid', reason: 'stale-session' }
  if (get(nativeNameChangeBusyAtom)) return { kind: 'invalid', reason: 'busy' }
  const fail = (reason: string): NameBoxCommitTarget => {
    set(nameBoxErrorMessageAtom, reason)
    set(nameBoxModeAtom, 'typing')
    return { kind: 'invalid', reason }
  }
  const value = input.input.trim()
  set(nameBoxInputAtom, input.input)
  set(nameBoxErrorMessageAtom, '')
  if (!value) return fail('Enter a name or cell address.')
  const snapshot = get(selectionSnapshotAtom)
  const sheetId = input.sheetId ?? snapshot.selection.sheetId
  const sheets = get(workbookDocumentAtom).sheets
  const named = resolveNativeNamedRange(value, get(nativeNamedRangesAtom), sheets)
  if (named === null) return fail('This named range no longer refers to an available worksheet range.')
  const cell = parseA1Cell(value)
  const range = parseA1Range(value)
  const target: NameBoxCommitTarget = named ? { kind: 'named-range', ...named }
    : cell ? { kind: 'cell', sheetId, coord: cell }
      : range ? { kind: 'range', sheetId, range }
        : { kind: 'define-name', sheetId, name: value, range: snapshot.range }
  if (target.kind !== 'define-name') {
    // 定位保留原来的即时行为；正在提交的单元格已经捕获自己的写入地址。
    // 不能因上一个异步编辑尚未收尾，就把下一次地址定位当作无效输入。
    const sheet = sheets.find((s) => s.id === target.sheetId)
    const bounds = target.kind === 'cell' ? {
      rowStart: target.coord.row, rowEnd: target.coord.row,
      colStart: target.coord.col, colEnd: target.coord.col,
    } : target.range!
    if (!sheet || bounds.rowEnd >= sheet.rowCount || bounds.colEnd >= sheet.colCount)
      return fail('This address is outside the current worksheet canvas.')
    if (get(activeWorkbookSheetAtom)?.id !== sheet.id) set(activateWorkbookSheetAtom, sheet)
    if (target.kind === 'cell') set(selectCellAtom, { sheetId: sheet.id, coord: target.coord })
    else set(setSelectionAtom, { kind: 'range', sheetId: sheet.id,
      anchor: { row: bounds.rowStart, col: bounds.colStart },
      focus: { row: bounds.rowEnd, col: bounds.colEnd } })
    set(nameBoxModeAtom, 'idle')
    return target
  }
  if (get(selectionRegionsAtom).length !== 1)
    return fail('Select one continuous range to name.')
  if (get(activeWorkbookSheetAtom)?.id !== sheetId || !get(rustWorkbookConnectionAtom))
    return fail('Wait for the Rust worksheet to finish loading.')
  const connection = get(rustWorkbookConnectionAtom)
  set(nameBoxModeAtom, 'committing')
  // 校验名称语法交给 Rust；迟到的回复不能覆盖下一次输入会话。
  return set(changeNativeNamedRangeAtom, {
    action: { kind: 'create', name: value, target: { sheetId, range: snapshot.range } },
  }).then((changed): NameBoxCommitTarget => {
    if (get(nameBoxSessionIdAtom) !== sessionId || get(rustWorkbookConnectionAtom) !== connection)
      return { kind: 'invalid', reason: 'stale-session' }
    if (!changed) return fail('The view changed. Try again after the worksheet finishes loading.')
    set(nameBoxModeAtom, 'idle')
    return target
  }, (error): NameBoxCommitTarget => {
    if (get(nameBoxSessionIdAtom) !== sessionId || get(rustWorkbookConnectionAtom) !== connection)
      return { kind: 'invalid', reason: 'stale-session' }
    return fail(error instanceof Error ? error.message : String(error))
  })
})
commitNameBoxAtom.debugLabel = 'spreadsheet.nameBox.commit'
