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
import { DEFAULT_NATIVE_TABLE_STYLE, NATIVE_TOTAL_FUNCTIONS, validNativeTableStyle,
  type NativeTable, type NativeTableStyle, type NativeTotalFunction, type TableChange } from './native-types'

interface Draft {
  name: string; range: string; column: string; newColumnName: string
  totalColumn: string; totalFunction: NativeTotalFunction | 'custom'
}
interface Panel extends Draft {
  ownerSheetId: string | null
  connection: RustWorkbookConnection | null
  revision?: ProjectionRevision
  editingName: string | null
  error: string
}
const CLOSED: Panel = { ownerSheetId: null, connection: null, editingName: null,
  name: '', range: '', column: '', newColumnName: '', totalColumn: '', totalFunction: 'sum', error: '' }
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
    currentTable: ready ? result.tables!.find((entry) =>
      entry.sheetIndex === sheet?.index && entry.name === state.editingName) : undefined,
  }
})

/** 打开/编辑只改草稿；每次提交均为一次 Rust 命令和一次返回投影。 */
export const runNativeTablePanelAtom = atom(null, async (get, set,
  action: 'open' | 'new' | 'close' | 'save' | 'convert' | 'resize' |
  'show-totals' | 'hide-totals' | 'save-total' | 'save-column' | { edit: string } | Partial<Draft> |
  { style: Partial<NativeTableStyle> },
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
  if (typeof action === 'object' && !('style' in action)) {
    if ('edit' in action) {
      const entry = result.tables.find((table) =>
        table.sheetIndex === sheet.index && table.name === action.edit)
      if (!entry) return fail('The table no longer exists.')
      set(draftAtom, { ...state, name: entry.name, editingName: entry.name, range: entry.range,
        column: entry.columns[0], newColumnName: entry.columns[0],
        ...totalDraft(entry), revision: result.revision, error: '' })
    } else if ('column' in action) {
      const entry = get(nativeTablePanelAtom).currentTable
      if (!entry || !entry.columns.includes(action.column!)) return fail('Choose a table column.')
      set(draftAtom, { ...state, column: action.column!, newColumnName: action.column!, error: '' })
    } else if ('totalColumn' in action) {
      const entry = get(nativeTablePanelAtom).currentTable
      if (!entry || !entry.columns.includes(action.totalColumn!)) return fail('Choose a table column.')
      set(draftAtom, { ...state, ...totalDraft(entry, action.totalColumn), error: '' })
    } else set(draftAtom, { ...state, ...action, error: '' })
    return true
  }
  // 公式引用可能跨表；与名称操作相同，保护任一表时拒绝工作簿级改写。
  if (get(workbookDocumentAtom).sheets.some((s) =>
    getSheetProtection(get(sheetProtectionAtom), s.id).mode === 'protected'))
    return fail('Unprotect the worksheets before changing tables.')
  if (state.revision !== result.revision) return fail('The workbook changed. Reopen Tables.')
  let change: TableChange
  const styleAction = typeof action === 'object' && 'style' in action
  const totalsAction = action === 'show-totals' || action === 'hide-totals' || action === 'save-total'
  if (styleAction) {
    const entry = get(nativeTablePanelAtom).currentTable
    if (!entry) return fail('Choose a table first.')
    const style = { ...(entry.style ?? DEFAULT_NATIVE_TABLE_STYLE), ...action.style }
    if (!validNativeTableStyle(style)) return fail('Choose a valid table style.')
    change = { kind: 'style', name: entry.name, style }
  } else if (action === 'save-column') {
    const entry = get(nativeTablePanelAtom).currentTable
    if (!entry || !entry.columns.includes(state.column)) return fail('Choose a table column.')
    if (!state.newColumnName.trim()) return fail('Enter a column name.')
    change = { kind: 'rename-column', name: entry.name, column: state.column, newName: state.newColumnName }
  } else if (totalsAction) {
    const entry = get(nativeTablePanelAtom).currentTable
    if (!entry) return fail('Choose a table first.')
    if (action === 'save-total') {
      if (!entry.hasTotals || !entry.columns.includes(state.totalColumn) ||
        !NATIVE_TOTAL_FUNCTIONS.includes(state.totalFunction as NativeTotalFunction))
        return fail('Choose a column and a total function.')
      change = { kind: 'total-function', name: entry.name, column: state.totalColumn,
        function: state.totalFunction as NativeTotalFunction }
    } else change = { kind: 'totals-row', name: entry.name, enabled: action === 'show-totals' }
  } else if (action === 'convert') {
    if (!state.editingName) return fail('Choose a table to convert.')
    change = { kind: 'convert-to-range', name: state.editingName }
  } else if (state.editingName && action !== 'resize') {
    if (!state.name.trim()) return fail('Enter a table name.')
    change = { kind: 'rename', name: state.editingName, newName: state.name.trim() }
  } else {
    const cell = parseA1Cell(state.range)
    const range = parseA1Range(state.range) ?? (cell ? {
      rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col,
    } : null)
    if (!range || range.rowEnd >= sheet.rowCount || range.colEnd >= sheet.colCount)
      return fail('Enter one range inside this worksheet, for example A1:C10.')
    if (action === 'resize') {
      if (!state.editingName) return fail('Choose a table to resize.')
      change = { kind: 'resize', name: state.editingName, range }
    } else change = { kind: 'create', name: state.name.trim() || undefined, range }
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
    if (get(draftAtom) === state) {
      const entry = reply.projection.tables.find((table) => table.name === state.editingName)
      const columnIndex = result.tables.find((table) => table.name === state.editingName)
        ?.columns.indexOf(state.column) ?? 0
      const column = action === 'resize' && entry?.columns.includes(state.column) ? state.column
        : entry?.columns[Math.max(0, columnIndex)] ?? entry?.columns[0] ?? ''
      set(draftAtom, (styleAction || totalsAction || action === 'save-column' || action === 'resize') && entry ? { ...state, range: entry.range,
        column, newColumnName: action === 'save-column' || action === 'resize' ? column : state.newColumnName,
        ...totalDraft(entry, state.totalColumn === state.column ? column : state.totalColumn),
        revision: reply.projection.revision, error: '' } : CLOSED)
    }
    return true
  } catch (error) {
    if (get(draftAtom) !== state || get(rustWorkbookConnectionAtom) !== connection ||
      get(activeWorkbookSheetAtom)?.id !== sheet.id) return false
    return fail(error instanceof Error ? error.message : String(error))
  } finally {
    if (get(pendingConnectionAtom) === connection) set(pendingConnectionAtom, null)
  }
})

/** 下拉框草稿取自 Rust 返回的函数投影；无法识别的用户公式明确显示为 Custom。 */
function totalDraft(table: NativeTable, requested?: string): Pick<Draft, 'totalColumn' | 'totalFunction'> {
  const index = Math.max(0, requested && table.columns.includes(requested)
    ? table.columns.indexOf(requested) : table.columns.length - 1)
  return { totalColumn: table.columns[index] ?? '',
    totalFunction: table.hasTotals ? table.totalFunctions?.[index] ?? 'custom' : 'sum' }
}
