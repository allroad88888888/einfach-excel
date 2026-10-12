import { useAtomValue } from '@einfach/react'
import {
  getViewportRangeRectangle,
  projectionSnapshotAtom,
  selectionRangesAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
  showFormulasAtom, formulaViewText,
  type CellRange,
  type DisplayCell,
} from '@einfach/spreadsheet-ui-core'
import { cellFormatStyle, cellTextRotationStyle } from './cell-format-style'
import { MergedCellBorders } from './MergedCellBorders'
import { CellDataBar } from './CellDataBar'
import './merged-cells.css'

/** 叠加完整合并框并裁到可见窗口，滚动不改变文本在原矩形里的位置。 */
export function MergedCells({ window, anchors }: {
  window?: CellRange
  anchors?: readonly DisplayCell[]
} = {}) {
  const snapshot = useAtomValue(projectionSnapshotAtom)
  const selections = useAtomValue(selectionRangesAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const showFormulas = useAtomValue(showFormulasAtom)
  const result = snapshot.result
  if (result?.kind !== 'visible-window' || result.sheetId !== metrics.sheetId) return null
  const origin = getViewportRangeRectangle(metrics, sizes, window ?? result.window)
  return (
    <div className="merged-cell-layer">
      {(anchors ?? result.mergeAnchors)?.map((cell) => {
        const span = cell.mergedSpan!
        const range = {
          rowStart: cell.row,
          colStart: cell.col,
          rowEnd: cell.row + span.rows - 1,
          colEnd: cell.col + span.cols - 1,
        }
        const rect = getViewportRangeRectangle(metrics, sizes, range)
        if (rect.width === 0 || rect.height === 0) return null
        const selected = selections.some((selection) =>
          selection.rowStart <= range.rowStart && selection.rowEnd >= range.rowEnd &&
          selection.colStart <= range.colStart && selection.colEnd >= range.colEnd)
        return (
          <div
            key={`${cell.row}:${cell.col}`}
            role="gridcell"
            aria-rowspan={span.rows}
            aria-colspan={span.cols}
            data-cell={`${cell.row}:${cell.col}`}
            data-merged-cell="true"
            title={showFormulas ? cell.formula : undefined}
            aria-selected={selected}
            className={`cell merged-cell${cell.dataBar ? ' cell-data-bar-host' : ''}`}
            style={{
              ...cellFormatStyle({ ...cell.format, borders: undefined }, cell.valueKind),
              border: 0,
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
            <MergedCellBorders range={range} window={window ?? result.window} />
            <CellDataBar bar={cell.dataBar} />
            <span className="cell-content">
              <span style={cellTextRotationStyle(cell.format)}>
                {formulaViewText(cell, showFormulas)}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
