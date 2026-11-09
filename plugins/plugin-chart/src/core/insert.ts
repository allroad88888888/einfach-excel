import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom, changeSheetDrawingAtom, drawingErrorAtom, editingSessionAtom,
  readWorkbookDisplayRangeAtom,
  selectDrawingAtom, selectionRangesAtom, sheetDrawingsAtom, type DrawingRange,
} from '@einfach-excel/spreadsheet-ui-core'
import { areaLayout, combineAreaGrids, validateChartAreas } from './areas'
import { buildChartDrawing, nextChartId } from './chart-drawing'
import { chartGridFromSnapshot } from './data'
import { tableOfArea } from './data-source'
import { chartSourceCatalogAtom } from './source-catalog'
import { toCellRange } from './range-text'
import type { ChartType } from './spec'

const errorAtom = atom<string | null>(null)
errorAtom.debugLabel = 'plugin.chart.insert.error.state'
const busyAtom = atom(false)
busyAtom.debugLabel = 'plugin.chart.insert.busy.state'
export const insertChartFeedbackAtom = atom((get) =>
  ({ error: get(errorAtom), busy: get(busyAtom) }))
insertChartFeedbackAtom.debugLabel = 'plugin.chart.insert.feedback'

export const dismissChartErrorAtom = atom(null, (_get, set) => set(errorAtom, null))
dismissChartErrorAtom.debugLabel = 'plugin.chart.insert.dismiss'

/**
 * 用当前连续选区插入图表：读一次数据猜表头与系列方向，放在选区右侧，
 * 一次 Rust 命令、一条撤销记录，插入后选中新图表。
 */
export const insertChartAtom = atom(null,
  async (get, set, requested: ChartType | 'recommended'): Promise<boolean> => {
  if (get(busyAtom) || get(editingSessionAtom).source) return false
  const sheet = get(activeWorkbookSheetAtom)
  if (!sheet) return false
  const fail = (error: string) => { set(errorAtom, error); return false }
  // 按 Ctrl 多选的不连续区域按 Excel 规则拼成一张数据表（同高左右拼，同宽上下拼）。
  const areas: DrawingRange[] = get(selectionRangesAtom).map((range) => ({
    startRow: range.rowStart, startCol: range.colStart, endRow: range.rowEnd, endCol: range.colEnd,
  }))
  const invalid = validateChartAreas(areas)
  if (invalid) return fail(invalid)
  set(busyAtom, true)
  set(errorAtom, null)
  try {
    const reads = await Promise.all(areas.map((area) =>
      set(readWorkbookDisplayRangeAtom, { sheetId: sheet.id, range: toCellRange(area) })))
    const failed = reads.find((read) => read.status === 'error')
    if (failed?.status === 'error') return fail(failed.error.message)
    if (get(activeWorkbookSheetAtom)?.id !== sheet.id) return false
    const grid = combineAreaGrids(reads.flatMap((read, index) => read.status === 'ok'
      ? [chartGridFromSnapshot(read.snapshot, areas[index]!)] : []), areaLayout(areas)!)
    const id = nextChartId(get(sheetDrawingsAtom))
    const built = buildChartDrawing({ id, areas, grid, requested })
    // 选区正好是一个表格时引用表名，之后表格扩行图表跟着扩。
    const table = areas.length === 1 ? tableOfArea(areas[0]!, get(chartSourceCatalogAtom)) : null
    const drawing = table ? { ...built, payload: { ...built.payload as object, source: table } }
      : built
    const changed = await set(changeSheetDrawingAtom, { type: 'set', drawing })
    if (changed) set(selectDrawingAtom, id)
    // 受保护的表等由 Rust 拒绝；把原因带回插入按钮旁。
    else set(errorAtom, get(drawingErrorAtom))
    return changed
  } finally {
    set(busyAtom, false)
  }
})
insertChartAtom.debugLabel = 'plugin.chart.insert'
