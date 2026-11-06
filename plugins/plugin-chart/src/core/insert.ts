import { atom } from '@einfach/core'
import {
  activeWorkbookSheetAtom, changeSheetDrawingAtom, drawingErrorAtom, editingSessionAtom,
  readWorkbookDisplayRangeAtom,
  selectDrawingAtom, selectionRegionsAtom, selectionSnapshotAtom, sheetDrawingsAtom,
  type DrawingRange, type SheetDrawing,
} from '@einfach-excel/spreadsheet-ui-core'
import { chartGridFromSnapshot, MAX_CHART_CELLS } from './data'
import { rangeCellCount, toCellRange } from './range-text'
import { recommendChart } from './recommend'
import { detectChartLayout } from './series-layout'
import { CHART_KIND, DEFAULT_CHART_SPEC, type ChartType } from './spec'

export const DEFAULT_CHART_WIDTH = 480
export const DEFAULT_CHART_HEIGHT = 288
const EXCEL_MAX_COLS = 16_384

const errorAtom = atom<string | null>(null)
errorAtom.debugLabel = 'plugin.chart.insert.error.state'
const busyAtom = atom(false)
busyAtom.debugLabel = 'plugin.chart.insert.busy.state'
export const insertChartFeedbackAtom = atom((get) =>
  ({ error: get(errorAtom), busy: get(busyAtom) }))
insertChartFeedbackAtom.debugLabel = 'plugin.chart.insert.feedback'

export const dismissChartErrorAtom = atom(null, (_get, set) => set(errorAtom, null))
dismissChartErrorAtom.debugLabel = 'plugin.chart.insert.dismiss'

/** 本表内唯一：chart-1、chart-2…；删除后不复用更小的号也无妨，只要不撞。 */
function nextChartId(drawings: readonly SheetDrawing[]): string {
  const used = new Set(drawings.map((drawing) => drawing.id))
  let index = drawings.length + 1
  while (used.has(`chart-${index}`)) index += 1
  return `chart-${index}`
}

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
  if (get(selectionRegionsAtom).length !== 1) return fail('Choose one continuous range.')
  const selected = get(selectionSnapshotAtom).range
  const range: DrawingRange = { startRow: selected.rowStart, startCol: selected.colStart,
    endRow: selected.rowEnd, endCol: selected.colEnd }
  if (rangeCellCount(range) < 2) return fail('Select the chart data first, including headers.')
  if (rangeCellCount(range) > MAX_CHART_CELLS)
    return fail('Choose at most 10,000 cells for a chart.')
  set(busyAtom, true)
  set(errorAtom, null)
  try {
    const read = await set(readWorkbookDisplayRangeAtom,
      { sheetId: sheet.id, range: toCellRange(range) })
    if (read.status === 'error') return fail(read.error.message)
    if (get(activeWorkbookSheetAtom)?.id !== sheet.id) return false
    const grid = chartGridFromSnapshot(read.snapshot, range)
    const detected = detectChartLayout(grid)
    const { type, layout } = requested === 'recommended'
      ? recommendChart(grid, detected) : { type: requested, layout: detected }
    const id = nextChartId(get(sheetDrawingsAtom))
    const drawing: SheetDrawing = {
      id,
      kind: CHART_KIND,
      anchor: { row: range.startRow, col: Math.min(EXCEL_MAX_COLS - 1, range.endCol + 2),
        offsetX: 0, offsetY: 0, width: DEFAULT_CHART_WIDTH, height: DEFAULT_CHART_HEIGHT },
      refs: [range],
      payload: { ...DEFAULT_CHART_SPEC, ...layout, type },
    }
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
