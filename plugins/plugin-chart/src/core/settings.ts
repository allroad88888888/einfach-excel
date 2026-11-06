import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom, changeSheetDrawingAtom, selectedDrawingAtom, sheetDrawingsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { validateChartAreas } from './areas'
import { formatRangesText, parseRangesText } from './range-text'
import { CHART_KIND, parseChartSpec, type ChartSpec } from './spec'

interface SettingsState {
  readonly sheetId: string
  readonly id: string
  readonly rangeDraft: string
  readonly error: string | null
  readonly busy: boolean
}
const stateAtom = atom<SettingsState | null>(null)
stateAtom.debugLabel = 'plugin.chart.settings.state'

/** 设置面板：每次改动立即写回 Rust，一项改动一条撤销记录，同 Excel 的格式窗格。 */
export const chartSettingsAtom = atom((get) => {
  const state = get(stateAtom)
  const drawing = state && state.sheetId === get(activeWorkbookSheetAtom)?.id
    ? get(sheetDrawingsAtom).find((entry) => entry.id === state.id && entry.kind === CHART_KIND)
    : undefined
  return state && drawing
    ? { open: true as const, drawing, spec: parseChartSpec(drawing.payload),
      rangeDraft: state.rangeDraft, error: state.error, busy: state.busy }
    : { open: false as const }
})
chartSettingsAtom.debugLabel = 'plugin.chart.settings'

/** 选中的对象是图表时可打开设置。 */
export const selectedChartAtom = atom((get) => {
  const drawing = get(selectedDrawingAtom)
  return drawing?.kind === CHART_KIND ? drawing : null
})
selectedChartAtom.debugLabel = 'plugin.chart.selected'

export const openChartSettingsAtom = atom(null, (get, set, id?: string): boolean => {
  const sheet = get(activeWorkbookSheetAtom)
  const target = id ?? get(selectedChartAtom)?.id
  const drawing = get(sheetDrawingsAtom).find((entry) => entry.id === target)
  if (!sheet || drawing?.kind !== CHART_KIND) return false
  set(stateAtom, { sheetId: sheet.id, id: drawing.id, rangeDraft: formatRangesText(drawing.refs),
    error: null, busy: false })
  return true
})
openChartSettingsAtom.debugLabel = 'plugin.chart.settings.open'

export type ChartSettingsAction =
  | { readonly type: 'spec'; readonly patch: Partial<ChartSpec> }
  | { readonly type: 'rangeDraft'; readonly text: string }
  | { readonly type: 'applyRange' }
  | { readonly type: 'close' }

export const updateChartSettingsAtom = atom(null,
  async (get, set, action: ChartSettingsAction): Promise<boolean> => {
    const state = get(stateAtom)
    const panel = get(chartSettingsAtom)
    if (action.type === 'close') { set(stateAtom, null); return true }
    if (!state || !panel.open || state.busy) return false
    if (action.type === 'rangeDraft') {
      set(stateAtom, { ...state, rangeDraft: action.text, error: null })
      return true
    }
    const fail = (error: string) => { set(stateAtom, { ...state, error }); return false }
    let next = panel.drawing
    if (action.type === 'spec') {
      next = { ...next, payload: { ...parseChartSpec(next.payload), ...action.patch } }
    } else {
      const ranges = parseRangesText(state.rangeDraft)
      if (!ranges) return fail('Enter a range such as B2:D10.')
      const invalid = validateChartAreas(ranges)
      if (invalid) return fail(invalid)
      next = { ...next, refs: ranges }
    }
    set(stateAtom, { ...state, busy: true, error: null })
    const changed = await set(changeSheetDrawingAtom, { type: 'set', drawing: next })
    const latest = get(stateAtom)
    if (latest?.id === state.id) set(stateAtom, { ...latest, busy: false,
      rangeDraft: action.type === 'applyRange' ? formatRangesText(next.refs) : latest.rangeDraft })
    return changed
  })
updateChartSettingsAtom.debugLabel = 'plugin.chart.settings.update'
