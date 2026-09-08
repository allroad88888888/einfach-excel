import type { CellRange } from '../shared'
import type {
  FrozenProjectionRegion,
  ProjectionViewport,
} from '../backend/frozen-projection-contracts'
import { getAxisOffsetForIndex } from './axis-geometry'

type Span = { start: number; end: number }
export type FrozenRegionWindow = Pick<FrozenProjectionRegion, 'pane' | 'window'>

/** 在像素预算内找可见的连续段；隐藏索引只跳过，不占渲染或读取预算。 */
function axisSpans(
  start: number,
  end: number,
  fallback: number,
  sizes: Record<string, number>,
  hidden: ReadonlySet<number>,
  pixels = Infinity,
): Span[] {
  const result: Span[] = []
  let used = 0
  for (let index = start; index <= end && used < pixels; index++) {
    if (hidden.has(index)) continue
    const size = sizes[index] ?? fallback
    if (size <= 0) continue
    const previous = result.at(-1)
    if (previous?.end === index - 1) previous.end = index
    else result.push({ start: index, end: index })
    used += size
  }
  return result
}

/** 冻结配置来自 Rust；这里仅把配置与稀疏尺寸换算成屏幕所需的读取矩形。 */
export function getFrozenRegions(
  scrollingWindow: CellRange,
  freeze: { rows: number; cols: number },
  viewport: ProjectionViewport,
  rowHeights: Record<string, number>,
  colWidths: Record<string, number>,
  hiddenRows: ReadonlySet<number>,
  hiddenCols: ReadonlySet<number>,
  maxCells = 50_000,
): { height: number; width: number; regions: FrozenRegionWindow[] } {
  const height = getAxisOffsetForIndex(
    freeze.rows,
    freeze.rows,
    viewport.rowHeight,
    rowHeights,
    hiddenRows,
  )
  const width = getAxisOffsetForIndex(
    freeze.cols,
    freeze.cols,
    viewport.colWidth,
    colWidths,
    hiddenCols,
  )
  const frozenRows = axisSpans(
    0,
    freeze.rows - 1,
    viewport.rowHeight,
    rowHeights,
    hiddenRows,
    viewport.height,
  )
  const frozenCols = axisSpans(
    0,
    freeze.cols - 1,
    viewport.colWidth,
    colWidths,
    hiddenCols,
    viewport.width,
  )
  const bodyRows =
    height < viewport.height
      ? axisSpans(
          Math.max(scrollingWindow.rowStart, freeze.rows),
          scrollingWindow.rowEnd,
          viewport.rowHeight,
          rowHeights,
          hiddenRows,
        )
      : []
  const bodyCols =
    width < viewport.width
      ? axisSpans(
          Math.max(scrollingWindow.colStart, freeze.cols),
          scrollingWindow.colEnd,
          viewport.colWidth,
          colWidths,
          hiddenCols,
        )
      : []
  const regions: FrozenRegionWindow[] = []
  let cellCount = 0
  const add = (pane: FrozenRegionWindow['pane'], rows: Span[], cols: Span[]) => {
    for (const row of rows)
      for (const col of cols) {
        cellCount += (row.end - row.start + 1) * (col.end - col.start + 1)
        if (cellCount > maxCells)
          throw new Error('Frozen projection exceeds the visible cell budget.')
        regions.push({
          pane,
          window: { rowStart: row.start, rowEnd: row.end, colStart: col.start, colEnd: col.end },
        })
      }
  }
  add('corner', frozenRows, frozenCols)
  add('top', frozenRows, bodyCols)
  add('left', bodyRows, frozenCols)
  return { height, width, regions }
}
