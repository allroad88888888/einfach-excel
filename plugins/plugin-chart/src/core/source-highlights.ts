import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom, setWorkbookHighlightsAtom, workbookHighlightsAtom,
  type DrawingRange, type WorkbookHighlight,
} from '@einfach-excel/spreadsheet-ui-core'
import { chartGridsAtom } from './data'
import { selectedChartAtom } from './settings'
import { cellRanges, pointCell, sourceRoles, sourceTable, type SourceCell } from './source-cells'
import { chartAreas } from './source-catalog'
import { parseChartSpec, type ChartType } from './spec'

/** 图表写的高亮都带这个前缀；宿主自己的高亮原样保留。 */
const PREFIX = 'plugin.chart:'
/** 同 Excel：系列名红、类别紫、数值蓝；点中的数据点橙。 */
const COLORS = { names: '#d93a3a', categories: '#8e4fc8', values: '#2f6fd8',
  point: '#f08c00' } as const
/** 宿主高亮总数上限是 128，给宿主留出余量。 */
const MAX_OWN = 96
/** 数据点与「系列 × 类别」一一对应、能反推单元格的类型。 */
const POINT_TYPES: readonly ChartType[] =
  ['column', 'bar', 'line', 'area', 'combo', 'pie', 'doughnut', 'scatter']

export interface ChartPointSelection {
  readonly chartId: string
  readonly series: number
  /** 类别序号（饼图扇区、散点点都换算成类别序号）。 */
  readonly point: number
}
const pointAtom = atom<ChartPointSelection | null>(null)
pointAtom.debugLabel = 'plugin.chart.point.state'

export const chartPointAtom = atom((get) => get(pointAtom))
chartPointAtom.debugLabel = 'plugin.chart.point'

/** 点击数据点记下它；点空白处传 null。 */
export const selectChartPointAtom = atom(null,
  (get, set, input: ChartPointSelection | null) => {
    const chart = get(selectedChartAtom)
    const type = chart && parseChartSpec(chart.payload).type
    set(pointAtom, input && type && POINT_TYPES.includes(type) ? input : null)
  })
selectChartPointAtom.debugLabel = 'plugin.chart.point.select'

const mark = (kind: keyof typeof COLORS, ranges: ReturnType<typeof cellRanges>) =>
  ranges.map((item, index): WorkbookHighlight =>
    ({ id: `${PREFIX}${kind}:${index}`, color: COLORS[kind], ...item }))

/** 选中图表时它该有的高亮：整片数据源按角色标色，再加点中的那一格。 */
export const chartSourceHighlightsAtom = atom((get): readonly WorkbookHighlight[] => {
  const chart = get(selectedChartAtom)
  const ownerId = get(activeWorkbookSheetAtom)?.id
  if (!chart || !ownerId) return []
  const resolved = chartAreas(get, chart)
  const refs = resolved.status === 'ok' ? resolved.areas
    : resolved.status === 'refs' ? resolved.refs : []
  const areas = refs.filter((range): range is DrawingRange => range !== null)
  const spec = parseChartSpec(chart.payload)
  const table = sourceTable(areas, ownerId, { ...spec, showHidden: true })
  if (!table) return []
  const roles = sourceRoles(table, spec)
  const point = get(pointAtom)
  const visible = point?.chartId === chart.id
    ? sourceTable(areas, ownerId, spec, get(chartGridsAtom)[chart.id]?.hidden) : null
  const cell: SourceCell | null = visible && point ? pointCell(visible, spec, point.series,
    point.point) : null
  return [
    ...mark('names', cellRanges(roles.names)),
    ...mark('categories', cellRanges(roles.categories)),
    ...mark('values', cellRanges(roles.values)),
    ...(cell ? mark('point', cellRanges([cell])) : []),
  ].slice(0, MAX_OWN)
})
chartSourceHighlightsAtom.debugLabel = 'plugin.chart.source.highlights'

/** 宿主会规范化（补默认色、冻结、字段顺序），按内容比较才不会反复写入。 */
const key = ({ id, sheetId, color, range }: WorkbookHighlight) =>
  `${id}|${sheetId}|${color ?? ''}|${range.rowStart},${range.colStart},${range.rowEnd},${range.colEnd}`
const sameList = (a: readonly WorkbookHighlight[], b: readonly WorkbookHighlight[]) =>
  a.length === b.length && a.every((item, index) => key(item) === key(b[index]!))

/** 把图表的高亮并进宿主高亮列表（只换自己那部分）；未变化时不写。 */
export const syncChartHighlightsAtom = atom(null, (get, set, clear = false) => {
  const all = get(workbookHighlightsAtom)
  const others = all.filter((item) => !item.id.startsWith(PREFIX))
  const current = all.filter((item) => item.id.startsWith(PREFIX))
  const point = get(pointAtom)
  if (point && point.chartId !== get(selectedChartAtom)?.id) set(pointAtom, null)
  const next = clear ? [] : get(chartSourceHighlightsAtom)
  if (!sameList(current, next)) set(setWorkbookHighlightsAtom, [...others, ...next])
})
syncChartHighlightsAtom.debugLabel = 'plugin.chart.source.syncHighlights'
