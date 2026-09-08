import type { CellRange } from '../shared'
import type { ViewportMetrics, ViewportSizeOverrideState } from './types'
import { getAxisOffsetForIndex } from './axis-geometry'

/** 用同一套稀疏尺寸计算矩形；合并格与编辑器不能各自累加行列宽高。 */
export function getViewportRangeRectangle(
  metrics: ViewportMetrics,
  sizes: ViewportSizeOverrideState,
  range: CellRange,
) {
  const sheet = metrics.sheetId ?? ''
  const row = (index: number) =>
    getAxisOffsetForIndex(
      index,
      metrics.rowCount,
      metrics.rowHeight,
      sizes.rowHeightsBySheet[sheet],
    )
  const col = (index: number) =>
    getAxisOffsetForIndex(index, metrics.colCount, metrics.colWidth, sizes.colWidthsBySheet[sheet])
  return {
    top: row(range.rowStart),
    left: col(range.colStart),
    height: row(range.rowEnd + 1) - row(range.rowStart),
    width: col(range.colEnd + 1) - col(range.colStart),
  }
}
