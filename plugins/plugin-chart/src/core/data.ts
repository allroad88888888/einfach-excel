import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom, projectionSnapshotAtom, readWorkbookDisplayRangeAtom,
  rustWorkbookConnectionAtom, type DisplayCell, type DrawingRange, type ProjectionRevision,
  type RustWorkbookConnection, type SheetDrawing, type VisibleProjectionResult,
} from '@einfach-excel/spreadsheet-ui-core'
import { formatRangeText, rangeCellCount, toCellRange } from './range-text'
import type { ChartCell, ChartGrid } from './series-layout'

/** 一张图最多读 10,000 格，远低于显示读取上限，避免一次编辑触发大读。 */
export const MAX_CHART_CELLS = 10_000

export interface ChartGridEntry {
  readonly status: 'loading' | 'ready' | 'error'
  readonly grid?: ChartGrid
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
  const range = drawing.refs[0] ?? null
  const key = formatRangeText(range)
  const current = get(cacheAtom)[drawing.id]
  if (current?.connection === connection && current.sheetId === sheet.id &&
    current.revision === revision && current.range === key) return
  const base = { connection, sheetId: sheet.id, revision, range: key }
  const publish = (entry: ChartGridEntry) =>
    set(cacheAtom, { ...get(cacheAtom), [drawing.id]: { ...base, ...entry } })
  if (!range) return publish({ status: 'error', error: 'The chart data range was deleted.' })
  if (rangeCellCount(range) > MAX_CHART_CELLS)
    return publish({ status: 'error', error: 'Choose at most 10,000 cells for a chart.' })
  // 读取期间保留上一份数据格，图表不闪空。
  publish({ status: 'loading', grid: current?.grid })
  const read = await set(readWorkbookDisplayRangeAtom,
    { sheetId: sheet.id, range: toCellRange(range) })
  const latest = get(cacheAtom)[drawing.id]
  // 更晚发起的读取已经接手时丢弃这次结果。
  if (get(rustWorkbookConnectionAtom) !== connection || latest?.revision !== revision ||
    latest.range !== key || latest.sheetId !== sheet.id) return
  publish(read.status === 'ok'
    ? { status: 'ready', grid: chartGridFromSnapshot(read.snapshot, range) }
    : { status: 'error', error: read.error.message })
})
loadChartGridAtom.debugLabel = 'plugin.chart.data.load'
