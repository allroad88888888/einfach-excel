import { useAtomValue } from '@einfach/react'
import {
  getViewportColumnWidth, getViewportRowHeight, getViewportRangeRectangle,
  projectionSnapshotAtom, viewportGeometrySizesAtom, viewportMetricsAtom, type CellRange,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import { createGridBorderStyles } from './grid-border-style'

/** 只画窗口内的合并外沿，复用普通格的共边归属；不展开合并内部。 */
export function MergedCellBorders({ range, window }: { range: CellRange; window: CellRange }) {
  const result = useAtomValue(projectionSnapshotAtom).result
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  if (result?.kind !== 'visible-window' || result.sheetId !== metrics.sheetId) return null
  const region = result.frozen?.regions.find((item) => item.window === window)
  const borderStyle = createGridBorderStyles({
    cells: region?.cells ?? result.cells, window, projection: result,
    scrollTop: metrics.scrollTop, scrollLeft: metrics.scrollLeft,
    rowHeights: Array.from({ length: window.rowEnd - window.rowStart + 1 }, (_, i) =>
      getViewportRowHeight(sizes, result.sheetId, window.rowStart + i, metrics.rowHeight)),
    columnWidths: Array.from({ length: window.colEnd - window.colStart + 1 }, (_, i) =>
      getViewportColumnWidth(sizes, result.sheetId, window.colStart + i, metrics.colWidth)),
  })
  const origin = getViewportRangeRectangle(metrics, sizes, range)
  const edges = []
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const horizontal = side === 'Top' || side === 'Bottom'
    const fixed = side === 'Top' ? range.rowStart : side === 'Bottom' ? range.rowEnd
      : side === 'Left' ? range.colStart : range.colEnd
    if (horizontal ? fixed < window.rowStart || fixed > window.rowEnd
      : fixed < window.colStart || fixed > window.colEnd) continue
    const start = horizontal ? Math.max(range.colStart, window.colStart)
      : Math.max(range.rowStart, window.rowStart)
    const end = horizontal ? Math.min(range.colEnd, window.colEnd)
      : Math.min(range.rowEnd, window.rowEnd)
    for (let index = start; index <= end; index++) {
      const row = horizontal ? fixed : index, col = horizontal ? index : fixed
      const rect = getViewportRangeRectangle(metrics, sizes,
        { rowStart: row, rowEnd: row, colStart: col, colEnd: col })
      // 隐藏末行／末列会压缩矩形，但不能吃掉合并框的底边／右边。
      if (horizontal ? rect.width === 0 : rect.height === 0) continue
      const resolved = borderStyle(row, col)
      const thickness = Number.parseFloat(String(resolved[`border${side}Width`] ?? 1))
      const style: CSSProperties = {
        position: 'absolute', pointerEvents: 'none', boxSizing: 'border-box',
        top: rect.top - origin.top - (side === 'Bottom' && !rect.height ? thickness : 0),
        left: rect.left - origin.left - (side === 'Right' && !rect.width ? thickness : 0),
        width: rect.width || thickness, height: rect.height || thickness,
        [`border${side}Style`]: resolved[`border${side}Style`] ?? 'solid',
        [`border${side}Color`]: resolved[`border${side}Color`] ?? 'var(--gridline)',
        [`border${side}Width`]: resolved[`border${side}Width`] ?? '1px',
      }
      edges.push(<span key={`${side}:${index}`} aria-hidden="true"
        data-merged-border={side.toLowerCase()} data-border-cell={`${row}:${col}`} style={style} />)
    }
  }
  return <>{edges}</>
}
