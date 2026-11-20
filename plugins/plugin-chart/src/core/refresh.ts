import type {
  CellRange,
  DrawingRange,
  VisibleProjectionResult,
  WorkbookChangeEvent,
} from '@einfach-excel/spreadsheet-ui-core'
import { toCellRange } from './range-text'
import type { ChartGrid } from './series-layout'
import type { ChartHidden } from './visible-grid'

/**
 * 绝不改变任何单元格值、数字格式、公式结果或行列显隐的持久命令：
 * 浮动对象移动/缩放/改样式、批注/备注/超链接/验证规则、行高列宽像素、冻结窗格、条件格式与视图开关。
 */
const NON_CELL_DISPLAY_KINDS = new Set([
  'drawings.set',
  'drawings.remove',
  'drawings.reorder',
  'host.drawing-set',
  'host.drawing-remove',
  'host.drawing-order',
  'notes.change',
  'comments.change',
  'hyperlink.change',
  'validation.change',
  'host.validation',
  'range.resize',
  'host.resize',
  'sheet.freeze',
  'host.freeze',
  'sheet.setView',
  'workbook.setSheetTabColor',
  'host.sheet-color',
  'workbook.setSheetHidden',
  'host.sheet-hidden',
  'protection.change',
  'conditionalFormat.change',
  'host.conditional-format',
])

/** 仅修改区域内样式（含数字格式），绝不触发区域外公式重算。 */
const FORMAT_ONLY_KINDS = new Set(['format.setRange', 'host.format'])

/**
 * 在源区域无任何公式（纯静态字面量）的前提下，其他工作表的单表写入、清除、粘贴、填充、
 * 排序、筛选或行列隐藏不会影响源表上的静态字面量，也不可能跨表产生动态数组溢出。
 */
const CROSS_SHEET_STATIC_SAFE_KINDS = new Set([
  'cell.setInput',
  'host.writeCells',
  'range.clear',
  'host.clear',
  'clipboard.paste',
  'range.fill',
  'richText.change',
  'host.rich-text',
  'range.visibility',
  'host.visibility',
  'sheet.filter',
  'host.filter',
  'range.sort',
  'host.sort',
  'textColumns.apply',
  'duplicates.apply',
  'range.shiftCells',
  'host.shift',
])

function rangesIntersect(a: CellRange, b: CellRange): boolean {
  return (
    a.rowStart <= b.rowEnd &&
    a.rowEnd >= b.rowStart &&
    a.colStart <= b.colEnd &&
    a.colEnd >= b.colStart
  )
}

function hasExplicitRanges(changes: WorkbookChangeEvent['changes']): boolean {
  return changes.length > 0 && changes.every((change) => change.ranges.length > 0)
}

function changesIntersectChartAreas(
  changes: WorkbookChangeEvent['changes'],
  areas: readonly DrawingRange[],
  ownerSheetId: string,
): boolean {
  for (const area of areas) {
    const areaSheetId = area.sheetId ?? ownerSheetId
    const areaRange = toCellRange(area)
    for (const change of changes) {
      if (change.sheetId !== areaSheetId) continue
      if (change.ranges.some((range) => rangesIntersect(range, areaRange))) return true
    }
  }
  return false
}

/**
 * 安全刷新命中策略：
 * 1. 纯对象/视图/元数据修改：不触碰单元格值或公式，直接跳过 `readDisplay` RPC。
 * 2. 纯样式（`format.setRange` / `host.format`）修改且范围与图表引用区域完全不相交：直接跳过 RPC。
 * 3. 图表源区域已确认不含公式（`!hasFormulas`），且本次修改全部落在非引用工作表：静态格不可能被跨表影响，直接跳过 RPC。
 * 4. 其余可能触发公式重算或同表溢出的修改：必须重读以防漏刷，再由 `sameChartSnapshot` 拦截无变化的 ECharts 重绘。
 */
export function canSkipChartDataRead(
  event: WorkbookChangeEvent | null,
  areas: readonly DrawingRange[],
  ownerSheetId: string,
  hasFormulas: boolean,
): boolean {
  if (!event || areas.length === 0) return false
  if (NON_CELL_DISPLAY_KINDS.has(event.kind)) return true
  if (FORMAT_ONLY_KINDS.has(event.kind) && hasExplicitRanges(event.changes)) {
    return !changesIntersectChartAreas(event.changes, areas, ownerSheetId)
  }
  if (
    !hasFormulas &&
    CROSS_SHEET_STATIC_SAFE_KINDS.has(event.kind) &&
    hasExplicitRanges(event.changes)
  ) {
    const targetSheets = new Set(areas.map((area) => area.sheetId ?? ownerSheetId))
    return event.changes.every((change) => !targetSheets.has(change.sheetId))
  }
  return false
}

export function snapshotsHaveFormulas(snapshots: readonly VisibleProjectionResult[]): boolean {
  return snapshots.some((snapshot) => snapshot.cells.some((cell) => Boolean(cell.formula)))
}

function sameIndexList(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** 快照签名比对：数据值、显示文本与隐藏轴完全相同时复用原引用，避免无谓重算与 ECharts setOption。 */
export function sameChartSnapshot(
  prevGrid: ChartGrid | undefined,
  prevHidden: ChartHidden | undefined,
  nextGrid: ChartGrid,
  nextHidden: ChartHidden,
): boolean {
  if (!prevGrid || !prevHidden || prevGrid.length !== nextGrid.length) return false
  if (
    !sameIndexList(prevHidden.rows, nextHidden.rows) ||
    !sameIndexList(prevHidden.cols, nextHidden.cols)
  )
    return false
  for (let r = 0; r < prevGrid.length; r += 1) {
    const aRow = prevGrid[r]!
    const bRow = nextGrid[r]!
    if (aRow.length !== bRow.length) return false
    for (let c = 0; c < aRow.length; c += 1) {
      const a = aRow[c]!
      const b = bRow[c]!
      if (a.kind !== b.kind || a.display !== b.display || !Object.is(a.value, b.value)) return false
    }
  }
  return true
}
