import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { selectionSnapshotAtom } from '../selection'
import { rangeEquals } from '../shared'
import { directionalFillFeedbackAtom, fillSelectionAtom } from './directional-command'
import { minimumFillSamples } from './series-options'
import { fillSeriesStateAtom as stateAtom, INITIAL_FILL_SERIES_STATE as initial,
  type SeriesKind } from './series-state'

export const fillSeriesPanelAtom = atom((get) => get(stateAtom))
type Action = 'open' | 'close' | 'apply' | 'new-list' | 'save-list' | 'delete-list' |
  { field: 'kind'; value: SeriesKind } | { field: 'direction'; value: 'down' | 'right' } |
  { field: 'sourceCount' | 'listText' | 'listName' | 'selectedList'; value: string }

/** 面板只保存选项；提交仍进入普通填充的唯一写入 command，不读取样本值。 */
export const configureFillSeriesAtom = atom(null, async (
  get, set, action: Action,
): Promise<boolean> => {
  if (get(directionalFillFeedbackAtom).busy || get(editingSessionAtom).source !== null) return false
  const state = get(stateAtom)
  const options = { listText: state.listText, listName: state.listName,
    selectedList: state.selectedList, lists: state.lists }
  if (action === 'close') { set(stateAtom, { ...initial, ...options }); return true }
  const selection = get(selectionSnapshotAtom)
  if (action === 'open') {
    set(stateAtom, { ...initial, ...options, target: {
      sheetId: selection.selection.sheetId, range: { ...selection.range },
    }, direction: selection.range.rowStart === selection.range.rowEnd ? 'right' : 'down' })
    return true
  }
  if (!state.target) return false
  const fail = (error: string) => { set(stateAtom, { ...state, error, notice: '' }); return false }
  if (typeof action === 'object' && action.field === 'selectedList') {
    if (action.value === '') {
      set(stateAtom, { ...state, selectedList: null, listName: '', listText: '', error: '', notice: '' })
      return true
    }
    const index = Number(action.value)
    const list = state.lists[index]
    if (!Number.isSafeInteger(index) || !list) return false
    set(stateAtom, { ...state, selectedList: index, listName: list.name, listText: list.text,
      error: '', notice: '' })
    return true
  }
  if (typeof action === 'object') {
    set(stateAtom, { ...state, [action.field]: action.value, error: '', notice: '',
      ...(action.field === 'kind' ? { sourceCount: String(minimumFillSamples(action.value)) } : {}),
    })
    return true
  }
  if (action === 'new-list') {
    set(stateAtom, { ...state, selectedList: null, listName: '', listText: '', error: '', notice: '' })
    return true
  }
  if (action === 'delete-list') {
    if (state.selectedList === null) return false
    set(stateAtom, { ...state, lists: state.lists.filter((_, i) => i !== state.selectedList),
      selectedList: null, listName: '', listText: '', error: '', notice: 'List deleted.' })
    return true
  }
  if (action === 'save-list') {
    const name = state.listName.trim()
    if (!name || name.length > 64) return fail('Enter a list name of 1–64 characters.')
    if (state.lists.some((list, i) => i !== state.selectedList &&
      list.name.toLowerCase() === name.toLowerCase())) return fail('A list with this name already exists.')
    if (state.listText.length > 16_384) return fail('Custom list is limited to 16384 characters.')
    const values = state.listText.trim().split(/\r?\n/).map(value => value.trim())
    if (values.length < 2 || values.length > 512 || values.some(value => !value) ||
      new Set(values.map(value => value.toLowerCase())).size !== values.length)
      return fail('Enter 2–512 non-empty, unique list items.')
    if (state.selectedList === null && state.lists.length >= 32)
      return fail('You can save at most 32 custom lists per workbook session.')
    const index = state.selectedList ?? state.lists.length
    const lists = [...state.lists]
    lists[index] = { name, text: values.join('\n') }
    set(stateAtom, { ...state, lists, selectedList: index, listName: name,
      listText: lists[index]!.text, error: '', notice: 'List saved.' })
    return true
  }
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
  // 替换工作簿会清空此状态；旧请求不能把旧面板或列表带回新会话。
  if (get(stateAtom) !== state) return false
  if (completed) set(stateAtom, { ...initial, ...options })
  else fail(get(directionalFillFeedbackAtom).error || 'Fill was not applied. Try again.')
  return completed
})
