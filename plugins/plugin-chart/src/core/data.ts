import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom, projectionSnapshotAtom, readWorkbookDisplayRangeAtom,
  workbookDocumentAtom,
  rustWorkbookConnectionAtom, type DisplayCell, type DrawingRange, type ProjectionRevision,
  type RustWorkbookConnection, type SheetDrawing, type VisibleProjectionResult,
} from '@einfach-excel/spreadsheet-ui-core'
import { areaLayout, combineAreaGrids, combineAreaHidden, MAX_CHART_CELLS } from './areas'
import { rangeCellCount, toCellRange } from './range-text'
import { chartAreas } from './source-catalog'
import type { ChartCell, ChartGrid } from './series-layout'
import { chartHiddenFromSnapshot, type ChartHidden } from './visible-grid'

export { MAX_CHART_CELLS }

export interface ChartGridEntry {
  readonly status: 'loading' | 'ready' | 'error'
  readonly grid?: ChartGrid
  readonly hidden?: ChartHidden
  readonly error?: string
}
interface CacheEntry extends ChartGridEntry {
  readonly connection: RustWorkbookConnection
  readonly sheetId: string
  readonly revision: ProjectionRevision
  readonly range: string
}
const cacheAtom = atom<Readonly<Record<string, CacheEntry>>>({})
cacheAtom.debugLabel = 'plugin.chart.data.cache'

/** 当前表各图表的数据格（按对象 id）；缓存上限是本表对象数，切表或换簿即失效。 */
export const chartGridsAtom = atom((get): Readonly<Record<string, ChartGridEntry>> => {
  const connection = get(rustWorkbookConnectionAtom)
  const sheetId = get(activeWorkbookSheetAtom)?.id
  return Object.fromEntries(Object.entries(get(cacheAtom))
    .filter(([, entry]) => entry.connection === connection && entry.sheetId === sheetId))
})
chartGridsAtom.debugLabel = 'plugin.chart.data.grids'

function displayKind(cell: DisplayCell): ChartCell['kind'] {
  if (cell.error) return 'error'
  return cell.valueKind ?? (cell.displayValue === '' ? 'blank' : 'string')
}

/** 投影只返回非空格；空位补成空白格，保持矩形。 */
export function chartGridFromSnapshot(snapshot: VisibleProjectionResult,
  range: DrawingRange): ChartGrid {
  const rows = range.endRow - range.startRow + 1
  const cols = range.endCol - range.startCol + 1
  const grid: ChartCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (): ChartCell => ({ display: '', value: null, kind: 'blank' })))
  for (const cell of snapshot.cells) {
    const row = grid[cell.row - range.startRow]
    if (!row || cell.col < range.startCol || cell.col > range.endCol) continue
    const kind = displayKind(cell)
    row[cell.col - range.startCol] = {
      display: cell.displayValue,
      kind,
      value: kind === 'number' && Number.isFinite(cell.numericValue) ? cell.numericValue! : null,
    }
  }
  return grid
}

/** 只取投影修订号：滚动换窗口不改修订，订阅它的图表不会随滚动重渲染。 */
export const chartRevisionAtom = atom((get) => {
  const result = get(projectionSnapshotAtom).result
  return result?.kind === 'visible-window' ? result.revision : undefined
})
chartRevisionAtom.debugLabel = 'plugin.chart.data.revision'

/** 修订版变化（编辑、公式重算、撤销）后重读；同一修订、同一区域只读一次。 */
export const loadChartGridAtom = atom(null,
  async (get, set, drawing: SheetDrawing): Promise<void> => {
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const result = get(projectionSnapshotAtom).result
  const revision = result?.kind === 'visible-window' ? result.revision : undefined
  if (!connection || !sheet || revision === undefined) return
  const resolved = chartAreas(get, drawing)
  const refs = resolved.status === 'ok' ? resolved.areas
    : resolved.status === 'refs' ? resolved.refs : []
  const key = JSON.stringify(resolved.status === 'error' ? resolved : refs)
  const current = get(cacheAtom)[drawing.id]
  if (current?.connection === connection && current.sheetId === sheet.id &&
    current.revision === revision && current.range === key) return
  const base = { connection, sheetId: sheet.id, revision, range: key }
  const publish = (entry: ChartGridEntry) =>
    set(cacheAtom, { ...get(cacheAtom), [drawing.id]: { ...base, ...entry } })
  if (resolved.status === 'error') return publish({ status: 'error', error: resolved.error })
  const areas = refs.filter((range): range is DrawingRange => range !== null)
  if (!areas.length || areas.length !== refs.length)
    return publish({ status: 'error', error: 'The chart data range was deleted.' })
  // 跨表区域：那张表被删时显示 #REF!；撤销删表后修订变化会再读。
  const live = new Set(get(workbookDocumentAtom).sheets.map((entry) => entry.id))
  if (areas.some((area) => area.sheetId && !live.has(area.sheetId)))
    return publish({ status: 'error', error: 'The chart data worksheet was deleted.' })
  if (areas.reduce((sum, area) => sum + rangeCellCount(area), 0) > MAX_CHART_CELLS)
    return publish({ status: 'error', error: 'Choose at most 10,000 cells for a chart.' })
  const layout = areaLayout(areas)
  if (!layout) return publish({ status: 'error', error: 'The chart areas must line up.' })
  // 读取期间保留上一份数据格，图表不闪空。
  publish({ status: 'loading', grid: current?.grid, hidden: current?.hidden })
  const reads = await Promise.all(areas.map((area) =>
    set(readWorkbookDisplayRangeAtom,
      { sheetId: area.sheetId ?? sheet.id, range: toCellRange(area) })))
  const latest = get(cacheAtom)[drawing.id]
  // 更晚发起的读取已经接手时丢弃这次结果。
  if (get(rustWorkbookConnectionAtom) !== connection || latest?.revision !== revision ||
    latest.range !== key || latest.sheetId !== sheet.id) return
  const failed = reads.find((read) => read.status === 'error')
  if (failed?.status === 'error') return publish({ status: 'error', error: failed.error.message })
  const snapshots = reads.flatMap((read) => read.status === 'ok' ? [read.snapshot] : [])
  const grids = snapshots.map((snapshot, index) => chartGridFromSnapshot(snapshot, areas[index]!))
  publish({ status: 'ready', grid: combineAreaGrids(grids, layout),
    hidden: combineAreaHidden(snapshots.map((snapshot, index) =>
      chartHiddenFromSnapshot(snapshot, areas[index]!)), grids, layout) })
})
loadChartGridAtom.debugLabel = 'plugin.chart.data.load'
