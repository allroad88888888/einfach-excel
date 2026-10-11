import { atom } from '@einfach/core'
import { quickFormulaAvailableAtom } from '../quick-formula/command'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionAuthorityWitnessAtom, selectionSnapshotAtom, type SelectionAuthorityWitness } from '../selection'
import { projectionSnapshotAtom } from '../projection'
import { applyGoToTargetAtom } from '../go-to'
import { scrollToCellAtom } from '../viewport/metrics'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { SpillInspection } from '../rust-workbook/spill-commands'

const EMPTY = { open: false, busy: false, error: null as string | null,
  inspection: null as SpillInspection | null }
const stateAtom = atom({ ...EMPTY, connection: null as RustWorkbookConnection | null,
  sheetId: '', authority: null as SelectionAuthorityWitness | null, revision: -1 })
const canQueryAtom = atom((get) =>
  get(quickFormulaAvailableAtom) && !get(nativeTableFeedbackAtom).busy)
export const spillAvailableAtom = atom((get) => get(canQueryAtom) &&
  !(get(stateAtom).connection === get(rustWorkbookConnectionAtom) && get(stateAtom).busy))
export const spillPanelAtom = atom((get) => {
  const state = get(stateAtom)
  const revision = get(projectionSnapshotAtom).result?.revision
  const current = state.connection === get(rustWorkbookConnectionAtom)
  return { ...(current ? state : EMPTY), stale: current && Boolean(state.inspection) && (
    state.sheetId !== get(activeWorkbookSheetAtom)?.id ||
    state.authority !== get(selectionAuthorityWitnessAtom) ||
    (typeof revision === 'number' && revision > state.revision)) }
})

export type SpillAction = 'open' | 'refresh' | 'close' | 'range' | 'anchor' | 'blocker'

/** 查询只有一次 Worker 往返；定位复用现有选区/滚动，不修改数据或历史。 */
export const runSpillAtom = atom(null, async (get, set, action: SpillAction): Promise<boolean> => {
  if (action === 'close') { set(stateAtom, { ...get(stateAtom), ...EMPTY }); return true }
  if (!get(spillAvailableAtom)) return false
  const connection = get(rustWorkbookConnectionAtom)!
  const sheet = get(activeWorkbookSheetAtom)!
  if (action !== 'open' && action !== 'refresh') {
    const state = get(spillPanelAtom)
    if (!state.open || !state.inspection || state.stale) return false
    const info = state.inspection
    const coord = action === 'anchor' && info.kind !== 'none' ? info.anchor
      : action === 'blocker' && info.kind === 'blocked' ? info.blocker : null
    const range = action === 'range' && info.kind === 'active' ? info.range
      : coord ? { rowStart: coord.row, rowEnd: coord.row,
        colStart: coord.col, colEnd: coord.col } : null
    if (!range) return false
    const valid = Object.values(range).every((n) => Number.isSafeInteger(n) && n >= 0) &&
      range.rowStart <= range.rowEnd && range.colStart <= range.colEnd &&
      range.rowEnd < sheet.rowCount && range.colEnd < sheet.colCount
    if (!valid) {
      set(stateAtom, { ...get(stateAtom), error: 'This spill target is outside the current worksheet canvas.' })
      return false
    }
    set(applyGoToTargetAtom, { sheetId: sheet.id, range })
    set(scrollToCellAtom, { coord: { row: range.rowStart, col: range.colStart },
      rowAlign: 'nearest', colAlign: 'nearest' })
    set(stateAtom, { ...get(stateAtom), ...EMPTY })
    return true
  }
  const authority = get(selectionAuthorityWitnessAtom)
  const pending = { ...EMPTY, connection, sheetId: sheet.id, authority, revision: -1,
    open: true, busy: true }
  set(stateAtom, pending)
  try {
    const { row, col } = get(selectionSnapshotAtom).activeCell
    const response = connection.request('formula.inspectSpill', {
      sheetId: sheet.id, cell: { row, col },
    })
    await Promise.resolve()
    if (get(stateAtom) === pending) set(stateAtom, pending)
    const result = await response
    if (get(rustWorkbookConnectionAtom) !== connection || get(stateAtom) !== pending) return false
    if (get(activeWorkbookSheetAtom) !== sheet || get(selectionAuthorityWitnessAtom) !== authority)
      throw new Error('The selection changed. Refresh spill details for the current cell.')
    const revision = get(projectionSnapshotAtom).result?.revision
    if (!result.inspection || !['none', 'active', 'blocked'].includes(result.inspection.kind) ||
      !Number.isSafeInteger(result.revision) || result.revision < 0 ||
      (typeof revision === 'number' && result.revision < revision))
      throw new Error('Spill details are out of date. Refresh to try again.')
    set(stateAtom, { ...pending, busy: false,
      inspection: result.inspection, revision: result.revision })
    return true
  } catch (cause) {
    if (get(rustWorkbookConnectionAtom) !== connection || get(stateAtom) !== pending) return false
    set(stateAtom, { ...pending, busy: false,
      error: cause instanceof Error ? cause.message : String(cause) })
    return false
  }
})
