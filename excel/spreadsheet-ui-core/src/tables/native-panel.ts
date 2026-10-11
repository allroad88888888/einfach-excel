import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import { parseA1Cell, parseA1Range, rangeToA1 } from '../name-box/address'
import { applyVisibleProjectionAtom, createVisibleProjectionRequest,
  issueProjectionRequestIdAtom, projectionSnapshotAtom } from '../projection'
import { validateProjectionResult } from '../projection/contracts'
import type { ProjectionRevision } from '../backend'
import type { TableChange } from './native-types'

interface Draft { name: string; range: string }
interface Panel extends Draft {
  ownerSheetId: string | null
  connection: RustWorkbookConnection | null
  revision?: ProjectionRevision
  editingName: string | null
  error: string
}
const CLOSED: Panel = { ownerSheetId: null, connection: null, editingName: null,
  name: '', range: '', error: '' }
const draftAtom = atom<Panel>(CLOSED)
const pendingConnectionAtom = atom<RustWorkbookConnection | null>(null)
/** 草稿与忙碌是 UI 状态；目录始终直接读取当前 Rust 投影。 */
export const nativeTablePanelAtom = atom((get) => {
  const state = get(draftAtom)
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const projection = get(projectionSnapshotAtom)
  const result = projection.result
  const ready = projection.status === 'ready' && result?.kind === 'visible-window' &&
    result.sheetId === sheet?.id && result.tables !== undefined
  return { ...state, ready,
    busy: Boolean(connection && get(pendingConnectionAtom) === connection),
    open: Boolean(connection && state.connection === connection &&
      state.ownerSheetId === sheet?.id),
    tables: ready ? result.tables!.filter((entry) => entry.sheetIndex === sheet?.index) : [],
  }
})

/** 打开/编辑只改草稿；提交三个动作均为一次 Rust 命令和一次返回投影。 */
export const runNativeTablePanelAtom = atom(null, async (get, set,
  action: 'open' | 'new' | 'close' | 'save' | 'convert' | { edit: string } | Partial<Draft>,
): Promise<boolean> => {
  const state = get(draftAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (connection && get(pendingConnectionAtom) === connection) return false
  if (action === 'close') { set(draftAtom, CLOSED); return true }
  const sheet = get(activeWorkbookSheetAtom)
  if (!connection || !sheet) return false
  const witness = get(projectionSnapshotAtom)
  const result = witness.result
  const visible = witness.request
  const fail = (error: string) => { set(draftAtom, { ...get(draftAtom), error }); return false }
  if (witness.status !== 'ready' || result?.kind !== 'visible-window' ||
    visible?.kind !== 'visible-window' || visible.sheetId !== sheet.id ||
    result.sheetId !== sheet.id || result.revision === undefined || result.tables === undefined)
    return fail('Wait for the Rust worksheet to finish loading.')
  if (get(editingSessionAtom).source || get(rustHistoryPanelAtom).busy ||
    get(sheetTabsAtom).mutation)
    return fail('Finish the current edit or history operation first.')
  if (action === 'open' || action === 'new') {
    const selection = get(selectionSnapshotAtom)
    set(draftAtom, { ...CLOSED, ownerSheetId: sheet.id, connection, revision: result.revision,
      range: get(selectionRegionsAtom).length === 1 ? rangeToA1(selection.range) : '' })
    return true
  }
  if (state.ownerSheetId !== sheet.id || state.connection !== connection) return false
  if (typeof action === 'object') {
    if ('edit' in action) {
      const entry = result.tables.find((table) =>
        table.sheetIndex === sheet.index && table.name === action.edit)
      if (!entry) return fail('The table no longer exists.')
      set(draftAtom, { ...state, name: entry.name, editingName: entry.name, range: entry.range,
        revision: result.revision, error: '' })
    } else set(draftAtom, { ...state, ...action, error: '' })
    return true
  }
  // 公式引用可能跨表；与名称操作相同，保护任一表时拒绝工作簿级改写。
  if (get(workbookDocumentAtom).sheets.some((s) =>
    getSheetProtection(get(sheetProtectionAtom), s.id).mode === 'protected'))
    return fail('Unprotect the worksheets before changing tables.')
  if (state.revision !== result.revision) return fail('The workbook changed. Reopen Tables.')
  let change: TableChange
  if (action === 'convert') {
    if (!state.editingName) return fail('Choose a table to convert.')
    change = { kind: 'convert-to-range', name: state.editingName }
  } else if (state.editingName) {
    if (!state.name.trim()) return fail('Enter a table name.')
    change = { kind: 'rename', name: state.editingName, newName: state.name.trim() }
  } else {
    const cell = parseA1Cell(state.range)
    const range = parseA1Range(state.range) ?? (cell ? {
      rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col,
    } : null)
    if (!range || range.rowEnd >= sheet.rowCount || range.colEnd >= sheet.colCount)
      return fail('Enter one range inside this worksheet, for example A1:C10.')
    change = { kind: 'create', name: state.name.trim() || undefined, range }
  }
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  const projection = createVisibleProjectionRequest({ sheetId: sheet.id, requestId,
    window: visible.window, viewport: visible.viewport, reason: 'toolbar' })
  set(pendingConnectionAtom, connection)
  try {
    const response = connection.request('table.change', {
      sheetId: sheet.id, action: change, revision: result.revision, projection,
    })
    await Promise.resolve()
    if (get(pendingConnectionAtom) === connection) set(pendingConnectionAtom, connection)
    const reply = await response
    if (get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id)
      return false
    if (!validateProjectionResult(reply.projection, { request: projection }).ok ||
      reply.projection.tables === undefined)
      throw new Error('Rust returned a mismatched table result.')
    const applied = set(applyVisibleProjectionAtom, {
      witness, request: projection, result: reply.projection,
    })
    if (applied.status !== 'applied') throw new Error('The view changed. Reopen Tables.')
    if (get(draftAtom) === state) set(draftAtom, CLOSED)
    return true
  } catch (error) {
    if (get(draftAtom) !== state || get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id) return false
    return fail(error instanceof Error ? error.message : String(error))
  } finally {
    if (get(pendingConnectionAtom) === connection) set(pendingConnectionAtom, null)
  }
})
