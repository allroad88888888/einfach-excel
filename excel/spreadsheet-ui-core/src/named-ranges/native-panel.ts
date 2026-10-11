import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { editingSessionAtom } from '../editing/session-atoms'
import { selectionRegionsAtom, selectionSnapshotAtom } from '../selection'
import { parseA1Cell, parseA1Range, rangeToA1 } from '../name-box/address'
import { projectionSnapshotAtom } from '../projection'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { applyGoToTargetAtom } from '../go-to'
import { goToReferenceAvailableAtom } from '../go-to/reference-command'
import { scrollToCellAtom } from '../viewport/metrics'
import { changeNativeNamedRangeAtom, nativeNameChangeBusyAtom } from './native-command'
import type { ProjectionRevision } from '../backend'
import type { NamedRangeChange } from './native-types'

interface Draft { name: string; targetSheetId: string; range: string }
interface Panel extends Draft {
  ownerSheetId: string | null
  connection: RustWorkbookConnection | null
  revision?: ProjectionRevision
  editingName: string | null
  error: string
}
const CLOSED: Panel = { ownerSheetId: null, connection: null, editingName: null,
  name: '', targetSheetId: '', range: '', error: '' }
/** 只保存面板草稿与用户可见的忙碌/错误状态。 */
const draftAtom = atom<Panel>(CLOSED)
export const nativeNameManagerAtom = atom((get) => {
  const projection = get(projectionSnapshotAtom)
  const result = projection.result
  const tables = projection.status === 'ready' && result?.kind === 'visible-window' &&
    result.sheetId === get(activeWorkbookSheetAtom)?.id ? result.tables : undefined
  return { ...get(draftAtom), busy: get(nativeNameChangeBusyAtom), tables,
    canLocateTable: get(goToReferenceAvailableAtom) }
})
/** 工作簿切换后隐藏旧草稿；视图无需接触 Rust connection。 */
export const nativeNameManagerOpenAtom = atom((get) => {
  const state = get(draftAtom)
  const sheet = get(activeWorkbookSheetAtom)
  return Boolean(sheet && state.ownerSheetId === sheet.id &&
    state.connection === get(rustWorkbookConnectionAtom))
})

export const runNativeNameManagerAtom = atom(null, async (get, set,
  action: 'open' | 'close' | 'new' | 'save' | 'delete' | { edit: string } |
  { locateTable: string } | Partial<Draft>,
): Promise<boolean> => {
  const state = get(draftAtom)
  if (get(nativeNameChangeBusyAtom)) return false
  if (action === 'close') { set(draftAtom, CLOSED); return true }
  const sheet = get(activeWorkbookSheetAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (!sheet || !connection) return false
  const witness = get(projectionSnapshotAtom)
  const visible = witness.request
  const result = witness.result
  const fail = (error: string) => {
    set(draftAtom, { ...get(draftAtom), error })
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
    set(draftAtom, { ...CLOSED, ownerSheetId: sheet.id, connection,
      targetSheetId: sheet.id, revision: result.revision,
      range: get(selectionRegionsAtom).length === 1 ? rangeToA1(selection.range) : '' })
    return true
  }
  if (state.ownerSheetId !== sheet.id || state.connection !== connection) return false
  if (typeof action === 'object') {
    if ('locateTable' in action) {
      if (!get(goToReferenceAvailableAtom)) return fail('Finish the current operation before navigating.')
      // 重新读取当前原生目录，不能把打开面板时的旧坐标当作仍然有效。
      const entry = result.tables?.find((table) => table.name === action.locateTable)
      const targetSheet = get(workbookDocumentAtom).sheets
        .find((s) => s.index === entry?.sheetIndex)
      const range = entry ? parseA1Range(entry.range) : null
      if (!targetSheet || !range || range.rowEnd >= targetSheet.rowCount ||
        range.colEnd >= targetSheet.colCount)
        return fail('The table no longer refers to an available worksheet range.')
      if (targetSheet.id !== sheet.id) set(activateWorkbookSheetAtom, targetSheet)
      set(applyGoToTargetAtom, { sheetId: targetSheet.id, range })
      set(scrollToCellAtom, { coord: { row: range.rowStart, col: range.colStart },
        rowAlign: 'start', colAlign: 'nearest' })
      set(draftAtom, CLOSED)
    } else if ('edit' in action) {
      const entry = result.namedRanges.find((candidate) => candidate.name === action.edit)
      if (!entry) return fail('The named range no longer exists.')
      const targetSheet = get(workbookDocumentAtom).sheets
        .find((s) => s.index === entry.target?.sheet)
      const bounds = entry.target?.range
      set(draftAtom, { ...state, name: entry.name, editingName: entry.name,
        revision: result.revision, targetSheetId: targetSheet?.id ?? sheet.id, error: '',
        range: bounds ? rangeToA1({ rowStart: bounds[0], colStart: bounds[1],
          rowEnd: bounds[2], colEnd: bounds[3] }) : '#REF!' })
    } else set(draftAtom, { ...state, ...action, error: '' })
    return true
  }
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
  try {
    const changed = await set(changeNativeNamedRangeAtom, {
      action: change, revision: state.revision,
    })
    if (get(draftAtom) !== state) return false
    if (!changed) {
      if (get(rustWorkbookConnectionAtom) !== connection ||
        get(activeWorkbookSheetAtom)?.id !== sheet.id)
        set(draftAtom, CLOSED)
      return false
    }
    set(draftAtom, CLOSED)
    return true
  } catch (error) {
    if (get(draftAtom) !== state) return false
    return fail(error instanceof Error ? error.message : String(error))
  }
})
