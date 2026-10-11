import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import { parseA1Cell, parseA1Range, rangeToA1 } from '../name-box'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom,
} from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import type { ProjectionRevision } from '../backend'
import type { NamedRangeChange, NativeNamedRange } from './native-types'

interface Draft { name: string; targetSheetId: string; range: string }
interface Panel extends Draft {
  ownerSheetId: string | null
  connection: RustWorkbookConnection | null
  revision?: ProjectionRevision
  editingName: string | null
  busy: boolean
  error: string
}
const CLOSED: Panel = { ownerSheetId: null, connection: null, editingName: null,
  name: '', targetSheetId: '', range: '', busy: false, error: '' }
const EMPTY: readonly NativeNamedRange[] = Object.freeze([])

/** 已提交目录直接读同一次投影，不建本地注册表或第二套撤销。 */
export const nativeNamedRangesAtom = atom((get): readonly NativeNamedRange[] => {
  if (!get(activeWorkbookSheetAtom)) return EMPTY
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' ? result.namedRanges ?? EMPTY : EMPTY
})
/** 只保存面板草稿与用户可见的忙碌/错误状态。 */
export const nativeNameManagerAtom = atom<Panel>(CLOSED)

export const runNativeNameManagerAtom = atom(null, async (get, set,
  action: 'open' | 'close' | 'new' | 'save' | 'delete' | { edit: string } | Partial<Draft>,
): Promise<boolean> => {
  const state = get(nativeNameManagerAtom)
  if (state.busy) return false
  if (action === 'close') { set(nativeNameManagerAtom, CLOSED); return true }
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!sheet || !connection) return false
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  const result = witness.result
  const fail = (error: string) => {
    set(nativeNameManagerAtom, { ...get(nativeNameManagerAtom), busy: false, error })
    return false
  }
  if (witness.status !== 'ready' || visible?.kind !== 'visible-window' ||
    visible.sheetId !== sheet.id || result?.kind !== 'visible-window' ||
    result.sheetId !== sheet.id || result.revision === undefined ||
    result.namedRanges === undefined)
    return fail('Wait for the Rust worksheet to finish loading.')
  if (action === 'open' || action === 'new') {
    if (get(editingSessionAtom).source) return false
    const selection = get(selectionSnapshotAtom)
    set(nativeNameManagerAtom, { ...CLOSED, ownerSheetId: sheet.id, connection,
      targetSheetId: sheet.id, revision: result.revision,
      range: get(selectionRegionsAtom).length === 1 ? rangeToA1(selection.range) : '' })
    return true
  }
  if (state.ownerSheetId !== sheet.id || state.connection !== connection) return false
  if (typeof action === 'object') {
    if ('edit' in action) {
      const entry = result.namedRanges.find((candidate) => candidate.name === action.edit)
      if (!entry) return fail('The named range no longer exists.')
      const targetSheet = get(workbookDocumentAtom).sheets
        .find((s) => s.index === entry.target?.sheet)
      const bounds = entry.target?.range
      set(nativeNameManagerAtom, { ...state, name: entry.name, editingName: entry.name,
        revision: result.revision, targetSheetId: targetSheet?.id ?? sheet.id, error: '',
        range: bounds ? rangeToA1({ rowStart: bounds[0], colStart: bounds[1],
          rowEnd: bounds[2], colEnd: bounds[3] }) : '#REF!' })
    } else set(nativeNameManagerAtom, { ...state, ...action, error: '' })
    return true
  }
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    get(sheetTabsAtom).mutation)
    return fail('Finish the current edit or history operation first.')
  if (get(workbookDocumentAtom).sheets.some((s) =>
    getSheetProtection(get(sheetProtectionAtom), s.id).mode === 'protected'))
    return fail('Unprotect the worksheets before changing workbook names.')
  if (state.revision !== result.revision)
    return fail('The workbook changed. Reopen the name editor.')
  let change: NamedRangeChange
  if (action === 'delete') {
    if (!state.editingName) return fail('Choose a named range to delete.')
    change = { kind: 'delete', name: state.editingName }
  } else {
    const name = state.name.trim()
    if (!name) return fail('Enter a name.')
    // 失效定义允许只改名；只有用户输入新坐标才提交新的目标。
    if (state.editingName && state.range === '#REF!') {
      change = { kind: 'update', name: state.editingName, newName: name }
    } else {
      const cell = parseA1Cell(state.range)
      const range = parseA1Range(state.range) ?? (cell
        ? { rowStart: cell.row, colStart: cell.col, rowEnd: cell.row, colEnd: cell.col } : null)
      const targetSheet = get(workbookDocumentAtom).sheets.find((s) => s.id === state.targetSheetId)
      if (!range || !targetSheet || range.rowEnd >= targetSheet.rowCount ||
        range.colEnd >= targetSheet.colCount)
        return fail('Enter a range inside the selected worksheet, for example A1:A100.')
      const target = { sheetId: targetSheet.id, range }
      change = state.editingName
        ? { kind: 'update', name: state.editingName, newName: name, target }
        : { kind: 'create', name, target }
    }
  }
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  const pending = { ...state, busy: true, error: '' }
  set(nativeNameManagerAtom, pending)
  try {
    const response = connection.request('namedRange.change', {
      sheetId: sheet.id, action: change, revision: result.revision, projection,
    })
    await Promise.resolve()
    set(nativeNameManagerAtom, pending)
    const reply = await response
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id)
      return false
    if (!validateProjectionResult(reply.projection, { request: projection }).ok ||
      reply.projection.namedRanges === undefined)
      throw new Error('Rust returned a mismatched named-range result.')
    const applied = set(applyVisibleProjectionAtom, {
      witness, request: projection, result: reply.projection,
    })
    if (applied.status !== 'applied') return fail('The view changed. Reopen the name editor.')
    set(nativeNameManagerAtom, CLOSED)
    return true
  } catch (error) {
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id)
      return false
    return fail(error instanceof Error ? error.message : String(error))
  } finally {
    if (get(nativeNameManagerAtom) === pending) set(nativeNameManagerAtom, CLOSED)
  }
})
