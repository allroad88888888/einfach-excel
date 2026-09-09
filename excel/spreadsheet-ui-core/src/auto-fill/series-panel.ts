import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { selectionSnapshotAtom } from '../selection'
import { rangeEquals, type CellRange } from '../shared'
import type { RustFillRangeRequest } from '../rust-workbook/commands'
import { directionalFillFeedbackAtom, fillSelectionAtom } from './directional-command'
import { minimumFillSamples } from './series-options'

type SeriesKind = NonNullable<RustFillRangeRequest['series']>['kind']
interface SeriesPanel {
  readonly target: { sheetId: string; range: CellRange } | null
  readonly kind: SeriesKind
  readonly direction: 'down' | 'right'
  readonly sourceCount: string
  readonly listText: string
  readonly error: string
}
const initial: SeriesPanel = {
  target: null, kind: 'number', direction: 'down', sourceCount: '2', listText: '', error: '',
}
const stateAtom = atom(initial)
export const fillSeriesPanelAtom = atom((get) => get(stateAtom))
type Action = 'open' | 'close' | 'apply' |
  { field: 'kind'; value: SeriesKind } | { field: 'direction'; value: 'down' | 'right' } |
  { field: 'sourceCount' | 'listText'; value: string }

/** 面板只保存选项；提交仍进入普通填充的唯一写入 command，不读取样本值。 */
export const configureFillSeriesAtom = atom(null, async (
  get, set, action: Action,
): Promise<boolean> => {
  if (get(directionalFillFeedbackAtom).busy || get(editingSessionAtom).source !== null) return false
  const state = get(stateAtom)
  if (action === 'close') { set(stateAtom, { ...initial, listText: state.listText }); return true }
  const selection = get(selectionSnapshotAtom)
  if (action === 'open') {
    set(stateAtom, { ...initial, listText: state.listText, target: {
      sheetId: selection.selection.sheetId, range: { ...selection.range },
    }, direction: selection.range.rowStart === selection.range.rowEnd ? 'right' : 'down' })
    return true
  }
  if (!state.target) return false
  if (typeof action === 'object') {
    set(stateAtom, { ...state, [action.field]: action.value, error: '',
      ...(action.field === 'kind' ? { sourceCount: String(minimumFillSamples(action.value)) } : {}),
    })
    return true
  }
  const fail = (error: string) => { set(stateAtom, { ...state, error }); return false }
  const { range, sheetId } = state.target
  if (sheetId !== selection.selection.sheetId || !rangeEquals(range, selection.range))
    return fail('The selection changed. Close and reopen Series.')
  const sourceCount = Number(state.sourceCount)
  const rows = range.rowEnd - range.rowStart + 1
  const cols = range.colEnd - range.colStart + 1
  if ((state.direction === 'down' ? cols : rows) !== 1 || !Number.isSafeInteger(sourceCount) ||
    sourceCount < minimumFillSamples(state.kind) ||
    sourceCount >= (state.direction === 'down' ? rows : cols))
    return fail('Select one row or column with enough samples and at least one destination.')
  if (state.kind === 'custom-list' && state.listText.length > 16_384)
    return fail('Custom list is limited to 16384 characters.')
  const customValues = state.kind === 'custom-list'
    ? state.listText.trim().split(/\r?\n/).map((value) => value.trim()) : undefined
  const completed = await set(fillSelectionAtom, {
    direction: state.direction, series: { kind: state.kind, sourceCount,
      ...(customValues ? { customValues } : {}) },
  })
  if (completed) set(stateAtom, { ...initial, listText: state.listText })
  else fail(get(directionalFillFeedbackAtom).error || 'Fill was not applied. Try again.')
  return completed
})
