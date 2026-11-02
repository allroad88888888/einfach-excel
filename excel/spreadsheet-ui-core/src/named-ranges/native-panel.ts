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
import type { ProjectionRevision } from '../contracts'
import type { NamedRangeChange } from './native-types'

interface Draft {
  name: string
  scopeSheetId: string
  targetSheetId: string
  range: string
}
interface Panel extends Draft {
  ownerSheetId: string | null
  connection: RustWorkbookConnection | null
  revision?: ProjectionRevision
  editingName: string | null
  editingScopeSheetId: string | null
  error: string
}
const CLOSED: Panel = {
  ownerSheetId: null,
  connection: null,
  editingName: null,
  editingScopeSheetId: null,
  name: '',
  scopeSheetId: '',
  targetSheetId: '',
  range: '',
  error: '',
}
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
  action: 'open' | 'close' | 'new' | 'save' | 'delete' | { edit: string; scope?: number | null } |
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
      scopeSheetId: '', targetSheetId: sheet.id, revision: result.revision,
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
      const entry = result.namedRanges.find((candidate) =>
        candidate.name === action.edit &&
        (action.scope === undefined || (candidate.scope ?? null) === action.scope),
      )
      if (!entry) return fail('The named range no longer exists.')
      const sheets = get(workbookDocumentAtom).sheets
      const scopeSheet = entry.scope != null
        ? sheets.find((s) => s.index === entry.scope)
        : undefined
      const targetSheet = sheets.find((s) => s.index === entry.target?.sheet)
      const bounds = entry.target?.range
      const rangeText = entry.formula
        ? entry.formula
        : bounds
          ? rangeToA1({
              rowStart: bounds[0], colStart: bounds[1], rowEnd: bounds[2], colEnd: bounds[3],
            })
          : '#REF!'
      set(draftAtom, { ...state, name: entry.name, editingName: entry.name,
        editingScopeSheetId: scopeSheet?.id ?? '', scopeSheetId: scopeSheet?.id ?? '',
        revision: result.revision, targetSheetId: targetSheet?.id ?? sheet.id, error: '',
        range: rangeText })
    } else set(draftAtom, { ...state, ...action, error: '' })
    return true
  }
  let change: NamedRangeChange
  if (action === 'delete') {
    if (!state.editingName) return fail('Choose a named range to delete.')
    change = {
      kind: 'delete',
      name: state.editingName,
      ...(state.editingScopeSheetId ? { scopeSheetId: state.editingScopeSheetId } : {}),
    }
  } else {
    const name = state.name.trim()
    if (!name) return fail('Enter a name.')
    const rawRange = state.range.trim()
    const scopeSheetId = state.scopeSheetId || null
    const oldScopeSheetId = state.editingScopeSheetId || null
    const scopeChanged = state.editingName !== null && scopeSheetId !== oldScopeSheetId
    // 失效定义允许只改名；只有用户输入新坐标或公式才提交新的定义。
    if (state.editingName && rawRange === '#REF!') {
      change = {
        kind: 'update',
        name: state.editingName,
        newName: name,
        ...(oldScopeSheetId ? { scopeSheetId: oldScopeSheetId } : {}),
        ...(scopeChanged ? { newScopeSheetId: scopeSheetId } : {}),
      }
    } else if (rawRange.startsWith('=')) {
      if (!rawRange.slice(1).trim()) {
        return fail('Enter a range inside the selected worksheet, for example A1:A100.')
      }
      change = state.editingName
        ? {
            kind: 'update',
            name: state.editingName,
            newName: name,
            formula: rawRange,
            ...(oldScopeSheetId ? { scopeSheetId: oldScopeSheetId } : {}),
            ...(scopeChanged ? { newScopeSheetId: scopeSheetId } : {}),
          }
        : {
            kind: 'create',
            name,
            formula: rawRange,
            ...(scopeSheetId ? { scopeSheetId } : {}),
          }
    } else {
      const sheets = get(workbookDocumentAtom).sheets
      let targetSheet = sheets.find((s) => s.id === state.targetSheetId)
      let a1Text = rawRange
      const bang = rawRange.lastIndexOf('!')
      if (bang > 0) {
        let sheetName = rawRange.slice(0, bang).trim()
        if (sheetName.startsWith("'") && sheetName.endsWith("'") && sheetName.length >= 2) {
          sheetName = sheetName.slice(1, -1).replace(/''/g, "'")
        }
        targetSheet = sheets.find((s) => s.name.toUpperCase() === sheetName.toUpperCase())
        a1Text = rawRange.slice(bang + 1).trim()
      }
      const cell = parseA1Cell(a1Text)
      const range = parseA1Range(a1Text) ?? (cell
        ? { rowStart: cell.row, colStart: cell.col, rowEnd: cell.row, colEnd: cell.col } : null)
      if (!range || !targetSheet || range.rowEnd >= targetSheet.rowCount ||
        range.colEnd >= targetSheet.colCount)
        return fail('Enter a range inside the selected worksheet, for example A1:A100.')
      const target = { sheetId: targetSheet.id, range }
      change = state.editingName
        ? {
            kind: 'update',
            name: state.editingName,
            newName: name,
            target,
            ...(oldScopeSheetId ? { scopeSheetId: oldScopeSheetId } : {}),
            ...(scopeChanged ? { newScopeSheetId: scopeSheetId } : {}),
          }
        : {
            kind: 'create',
            name,
            target,
            ...(scopeSheetId ? { scopeSheetId } : {}),
          }
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
