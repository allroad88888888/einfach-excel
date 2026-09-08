import { useAtomValue } from '@einfach/react'
import {
  getViewportRangeRectangle,
  projectionSnapshotAtom,
  selectionSnapshotAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { cellFormatStyle, cellTextRotationStyle } from './cell-format-style'
import './merged-cells.css'

/** 叠加完整合并框并裁到可见窗口，滚动不改变文本在原矩形里的位置。 */
export function MergedCells() {
  const snapshot = useAtomValue(projectionSnapshotAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const result = snapshot.result
  if (result?.kind !== 'visible-window' || result.sheetId !== metrics.sheetId) return null
  const origin = getViewportRangeRectangle(metrics, sizes, result.window)
  return (
    <div className="merged-cell-layer">
      {result.mergeAnchors?.map((cell) => {
        const span = cell.mergedSpan!
        const range = {
          rowStart: cell.row,
          colStart: cell.col,
          rowEnd: cell.row + span.rows - 1,
          colEnd: cell.col + span.cols - 1,
        }
        const rect = getViewportRangeRectangle(metrics, sizes, range)
        if (rect.width === 0 || rect.height === 0) return null
        const selected =
          selection.range.rowStart <= range.rowStart &&
          selection.range.rowEnd >= range.rowEnd &&
          selection.range.colStart <= range.colStart &&
          selection.range.colEnd >= range.colEnd
        return (
          <div
            key={`${cell.row}:${cell.col}`}
            role="gridcell"
            aria-rowspan={span.rows}
            aria-colspan={span.cols}
            data-cell={`${cell.row}:${cell.col}`}
            data-merged-cell="true"
            aria-selected={selected}
            className="cell merged-cell"
            style={{
              ...cellFormatStyle(cell.format),
              top: rect.top - origin.top,
              left: rect.left - origin.left,
              width: rect.width,
              height: rect.height,
              justifyContent:
                cell.format?.verticalAlign === 'top'
                  ? 'flex-start'
                  : cell.format?.verticalAlign === 'center'
                    ? 'center'
                    : 'flex-end',
            }}
          >
            <span className="cell-content">
              <span style={cellTextRotationStyle(cell.format)}>{cell.displayValue}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
