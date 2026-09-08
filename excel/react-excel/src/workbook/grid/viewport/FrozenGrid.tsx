import { useAtomValue } from '@einfach/react'
import {
  getViewportColumnWidth,
  getViewportRowHeight,
  getViewportRangeRectangle,
  projectionSnapshotAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
  selectionSnapshotAtom,
  type CellRange,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import { SpreadsheetGrid } from '../cells/SpreadsheetGrid'
import { MergedCells } from '../cells/MergedCells'
import { GridHeading } from './GridHeading'
import { WORKBOOK_GRID_ROW_HEADER_WIDTH, WORKBOOK_GRID_ROW_HEIGHT } from './workbook-grid-config'
import './frozen-grid.css'

/** 固定区域只摆放同一投影里的小矩形；选区、格式、编辑仍使用公共组件及命令。 */
export function FrozenGrid({ focusGrid }: { focusGrid: () => void }) {
  const result = useAtomValue(projectionSnapshotAtom).result
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  if (result?.kind !== 'visible-window' || result.sheetId !== metrics.sheetId || !result.frozen)
    return null
  const { frozen, freeze } = result
  if (!freeze || (!freeze.rows && !freeze.cols)) return null
  const width = Math.min(frozen.width, metrics.viewportWidth)
  const height = Math.min(frozen.height, metrics.viewportHeight)
  const gutter = WORKBOOK_GRID_ROW_HEADER_WIDTH
  const heading = WORKBOOK_GRID_ROW_HEIGHT
  const rect = (range: CellRange) => getViewportRangeRectangle(metrics, sizes, range)
  const rowHeight = (row: number) =>
    getViewportRowHeight(sizes, result.sheetId, row, metrics.rowHeight)
  const colWidth = (col: number) =>
    getViewportColumnWidth(sizes, result.sheetId, col, metrics.colWidth)
  const rowIndices = new Set<number>()
  const colIndices = new Set<number>()
  for (const region of frozen.regions) {
    if (region.pane !== 'left')
      for (let row = region.window.rowStart; row <= region.window.rowEnd; row++) rowIndices.add(row)
    if (region.pane !== 'top')
      for (let col = region.window.colStart; col <= region.window.colEnd; col++) colIndices.add(col)
  }
  const panes = {
    corner: { top: heading, left: gutter, width, height },
    top: { top: heading, left: gutter + width, width: metrics.viewportWidth - width, height },
    left: { top: heading + height, left: gutter, width, height: metrics.viewportHeight - height },
  }
  return (
    <div
      className="frozen-viewport"
      style={{ width: metrics.viewportWidth + gutter, height: metrics.viewportHeight + heading }}
    >
      {(['top', 'left', 'corner'] as const).map((pane) => {
        const bounds = panes[pane]
        if (bounds.width <= 0 || bounds.height <= 0) return null
        return (
          <div key={pane} className="frozen-pane" data-frozen-pane={pane} style={bounds}>
            {frozen.regions
              .filter((region) => region.pane === pane)
              .map((region) => {
                const range = region.window
                const box = rect(range)
                const style = {
                  position: 'absolute',
                  transform: 'none',
                  top: box.top - (pane === 'left' ? metrics.scrollTop + height : 0),
                  left: box.left - (pane === 'top' ? metrics.scrollLeft + width : 0),
                  height: box.height,
                  '--grid-window-width': `${box.width}px`,
                } as CSSProperties
                return (
                  <div
                    className="grid-surface"
                    key={`${range.rowStart}:${range.colStart}`}
                    style={style}
                  >
                    <SpreadsheetGrid
                      window={range}
                      cells={region.cells}
                      mergedRanges={result.mergedRanges}
                      selected={selection.range}
                      rowHeights={Array.from(
                        { length: range.rowEnd - range.rowStart + 1 },
                        (_, i) => rowHeight(range.rowStart + i),
                      )}
                      columnWidths={Array.from(
                        { length: range.colEnd - range.colStart + 1 },
                        (_, i) => colWidth(range.colStart + i),
                      )}
                    />
                    <MergedCells window={range} anchors={region.mergeAnchors} />
                  </div>
                )
              })}
          </div>
        )
      })}
      <div className="frozen-column-headers" style={{ left: gutter, width, height: heading }}>
        {[...colIndices].map((col) => {
          const box = rect({ rowStart: 0, rowEnd: 0, colStart: col, colEnd: col })
          return (
            <GridHeading
              key={col}
              axis="column"
              index={col}
              focusGrid={focusGrid}
              style={{
                position: 'absolute',
                left: box.left,
                width: colWidth(col),
                height: heading,
              }}
            />
          )
        })}
      </div>
      <div className="frozen-row-headers" style={{ top: heading, width: gutter, height }}>
        {[...rowIndices].map((row) => {
          const box = rect({ rowStart: row, rowEnd: row, colStart: 0, colEnd: 0 })
          return (
            <GridHeading
              key={row}
              axis="row"
              index={row}
              focusGrid={focusGrid}
              style={{ position: 'absolute', top: box.top, width: gutter, height: rowHeight(row) }}
            />
          )
        })}
      </div>
    </div>
  )
}
