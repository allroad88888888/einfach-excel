import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom,
  changeSheetDrawingAtom,
  selectedDrawingAtom,
  sheetDrawingsAtom,
  type DrawingRange,
  type SheetDrawing,
} from '@einfach-excel/spreadsheet-ui-core'
import { validateChartAreas } from './areas'
import { parseChartSource, resolveChartSource } from './data-source'
import { formatRangesText, parseRangesText, type SheetDirectory } from './range-text'
import { activeSheetDirectoryAtom } from './sheet-directory'
import { chartSourceCatalogAtom } from './source-catalog'
import { CHART_KIND, hasAxes, hasLegend, parseChartSpec, type ChartSpec } from './spec'

export const CHART_SETTINGS_SECTIONS = ['title', 'legend', 'axis', 'series'] as const
export type ChartSettingsSection = (typeof CHART_SETTINGS_SECTIONS)[number]

/** 将 ECharts 元素事件（componentType）映射到设置面板对应的分组。 */
export function chartSectionForComponent(
  componentType: string | null | undefined,
  spec: Pick<ChartSpec, 'type'>,
): ChartSettingsSection | null {
  if (componentType === 'title') return 'title'
  if (componentType === 'legend') return hasLegend(spec.type) ? 'legend' : null
  if (
    componentType === 'xAxis' ||
    componentType === 'yAxis' ||
    componentType === 'angleAxis' ||
    componentType === 'radiusAxis'
  )
    return hasAxes(spec.type) ? 'axis' : null
  if (componentType === 'series') return 'series'
  return null
}

/** 数据区域栏显示的文本：引用表格或名称时显示名称，否则显示 A1 区域。 */
const rangeText = (drawing: SheetDrawing, directory: SheetDirectory) =>
  parseChartSpec(drawing.payload).source || formatRangesText(drawing.refs, directory)

interface SettingsState {
  readonly sheetId: string
  readonly id: string
  readonly rangeDraft: string
  readonly error: string | null
  readonly busy: boolean
  readonly section: ChartSettingsSection | null
  readonly focusSeq: number
}
const stateAtom = atom<SettingsState | null>(null)
stateAtom.debugLabel = 'plugin.chart.settings.state'

/** 设置面板：每次改动立即写回 Rust，一项改动一条撤销记录，同 Excel 的格式窗格。 */
export const chartSettingsAtom = atom((get) => {
  const state = get(stateAtom)
  const drawing =
    state && state.sheetId === get(activeWorkbookSheetAtom)?.id
      ? get(sheetDrawingsAtom).find((entry) => entry.id === state.id && entry.kind === CHART_KIND)
      : undefined
  return state && drawing
    ? {
        open: true as const,
        drawing,
        spec: parseChartSpec(drawing.payload),
        rangeDraft: state.rangeDraft,
        error: state.error,
        busy: state.busy,
        section: state.section,
        focusSeq: state.focusSeq,
      }
    : { open: false as const }
})
chartSettingsAtom.debugLabel = 'plugin.chart.settings'

/** 选中的对象是图表时可打开设置。 */
export const selectedChartAtom = atom((get) => {
  const drawing = get(selectedDrawingAtom)
  return drawing?.kind === CHART_KIND ? drawing : null
})
selectedChartAtom.debugLabel = 'plugin.chart.selected'

export type OpenChartSettingsInput =
  | string
  | { readonly id?: string; readonly section?: ChartSettingsSection | null }
  | undefined

export const openChartSettingsAtom = atom(
  null,
  (get, set, input?: OpenChartSettingsInput): boolean => {
    const sheet = get(activeWorkbookSheetAtom)
    const id = typeof input === 'string' ? input : input?.id
    const section = typeof input === 'object' && input !== null ? (input.section ?? null) : null
    const target = id ?? get(selectedChartAtom)?.id
    const drawing = get(sheetDrawingsAtom).find((entry) => entry.id === target)
    if (!sheet || drawing?.kind !== CHART_KIND) return false
    const previous = get(stateAtom)
    const sameChart = previous?.sheetId === sheet.id && previous.id === drawing.id
    set(stateAtom, {
      sheetId: sheet.id,
      id: drawing.id,
      rangeDraft: sameChart
        ? previous.rangeDraft
        : rangeText(drawing, get(activeSheetDirectoryAtom)),
      error: sameChart ? previous.error : null,
      busy: false,
      section,
      focusSeq: (previous?.focusSeq ?? 0) + 1,
    })
    return true
  },
)
openChartSettingsAtom.debugLabel = 'plugin.chart.settings.open'

export type ChartSettingsAction =
  | { readonly type: 'spec'; readonly patch: Partial<ChartSpec> }
  | { readonly type: 'rangeDraft'; readonly text: string }
  | { readonly type: 'applyRange' }
  | { readonly type: 'section'; readonly section: ChartSettingsSection | null }
  | { readonly type: 'close' }

export const updateChartSettingsAtom = atom(
  null,
  async (get, set, action: ChartSettingsAction): Promise<boolean> => {
    const state = get(stateAtom)
    const panel = get(chartSettingsAtom)
    if (action.type === 'close') {
      set(stateAtom, null)
      return true
    }
    if (!state || !panel.open || state.busy) return false
    if (action.type === 'section') {
      set(stateAtom, { ...state, section: action.section, focusSeq: state.focusSeq + 1 })
      return true
    }
    if (action.type === 'rangeDraft') {
      set(stateAtom, { ...state, rangeDraft: action.text, error: null })
      return true
    }
    const fail = (error: string) => {
      set(stateAtom, { ...state, error })
      return false
    }
    let next = panel.drawing
    if (action.type === 'spec') {
      next = { ...next, payload: { ...parseChartSpec(next.payload), ...action.patch } }
    } else {
      const text = state.rangeDraft.trim()
      let ranges: DrawingRange[] | null = parseRangesText(text, get(activeSheetDirectoryAtom))
      let source = ''
      if (!ranges && parseChartSource(text)) {
        const resolved = resolveChartSource(text, get(chartSourceCatalogAtom))
        if (resolved.status === 'error') return fail(resolved.error)
        ranges = resolved.areas
        source = text
      }
      if (!ranges) return fail('Enter a range such as B2:D10, a table or a defined name.')
      const invalid = validateChartAreas(ranges)
      if (invalid) return fail(invalid)
      next = { ...next, refs: ranges, payload: { ...parseChartSpec(next.payload), source } }
    }
    set(stateAtom, { ...state, busy: true, error: null })
    const changed = await set(changeSheetDrawingAtom, { type: 'set', drawing: next })
    const latest = get(stateAtom)
    if (latest?.id === state.id)
      set(stateAtom, {
        ...latest,
        busy: false,
        rangeDraft:
          action.type === 'applyRange'
            ? rangeText(next, get(activeSheetDirectoryAtom))
            : latest.rangeDraft,
      })
    return changed
  },
)
updateChartSettingsAtom.debugLabel = 'plugin.chart.settings.update'
