import { useAtomValue } from '@einfach/react'
import {
  activeSheetFormulaReferenceTokensAtom,
  activeWorkbookSheetAtom,
  mergeRangeAt,
  projectedFreezeAtom,
  projectionSnapshotAtom,
  serializeRangeRef,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
  type FormulaReferenceToken,
} from '@einfach-excel/spreadsheet-ui-core'
import { selectionEdgeGeometry } from '../drag-move/selection-edge-geometry'
import {
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT,
  workbookViewportMetrics,
} from '../grid/viewport/workbook-grid-config'
import { FORMULA_REFERENCE_COLORS, FORMULA_REFERENCE_FILLS } from './FormulaReferenceHighlight'
import './formula-reference.css'
import { useGridGutter } from '../grid/viewport/grid-gutter'

/**
 * Non-interactive worksheet overlay that renders colored frames for every
 * reference token targeting the currently viewed worksheet.
 */
export function FormulaReferenceOverlay() {
  const { gutter, heading } = useGridGutter()
  const tokens = useAtomValue(activeSheetFormulaReferenceTokensAtom)
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const viewportMetrics = useAtomValue(viewportMetricsAtom)
  const sizeOverrides = useAtomValue(viewportGeometrySizesAtom)
  const projectedFreeze = useAtomValue(projectedFreezeAtom)
  const projection = useAtomValue(projectionSnapshotAtom).result

  if (tokens.length === 0 || activeSheet === null) return null

  const sheetId = activeSheet.id
  const fallback = workbookViewportMetrics(activeSheet.rowCount, activeSheet.colCount, sheetId)
  const metrics = {
    ...viewportMetrics,
    sheetId,
    rowCount: activeSheet.rowCount || viewportMetrics.rowCount || fallback.rowCount,
    colCount: activeSheet.colCount || viewportMetrics.colCount || fallback.colCount,
    viewportWidth: viewportMetrics.viewportWidth || fallback.viewportWidth,
    viewportHeight: viewportMetrics.viewportHeight || fallback.viewportHeight,
    rowHeight: WORKBOOK_GRID_ROW_HEIGHT,
    colWidth: WORKBOOK_GRID_COLUMN_WIDTH,
  }
  const freeze = projectedFreeze?.sheetId === sheetId ? projectedFreeze : null
  const mergedRanges =
    projection?.kind === 'visible-window' && projection.sheetId === sheetId
      ? (projection.mergedRanges ?? [])
      : []

  const uniqueTokens = new Map<string, FormulaReferenceToken>()
  for (const token of tokens) {
    const refText = serializeRangeRef(
      { row: token.range.rowStart, col: token.range.colStart },
      { row: token.range.rowEnd, col: token.range.colEnd },
    )
    if (!uniqueTokens.has(refText)) {
      uniqueTokens.set(refText, token)
    }
  }

  const boxes = [...uniqueTokens.entries()].flatMap(([refText, token]) => {
    const displayRange =
      token.range.rowStart === token.range.rowEnd && token.range.colStart === token.range.colEnd
        ? (mergeRangeAt(mergedRanges, {
            row: token.range.rowStart,
            col: token.range.colStart,
          }) ?? token.range)
        : token.range
    const frame = selectionEdgeGeometry(displayRange, metrics, sizeOverrides, freeze)
    if (frame.width <= 0 || frame.height <= 0) return []
    const colorSlot = token.colorIndex % FORMULA_REFERENCE_COLORS.length
    return [
      <div
        key={refText}
        aria-hidden="true"
        className="formula-ref-range"
        data-formula-ref={refText}
        data-ref-color={colorSlot}
        style={{
          left: frame.left + gutter,
          top: frame.top + heading,
          width: frame.width,
          height: frame.height,
          borderColor: FORMULA_REFERENCE_COLORS[colorSlot],
          backgroundColor: FORMULA_REFERENCE_FILLS[colorSlot],
          borderTopWidth: frame.edges.top ? 2 : 0,
          borderBottomWidth: frame.edges.bottom ? 2 : 0,
          borderLeftWidth: frame.edges.left ? 2 : 0,
          borderRightWidth: frame.edges.right ? 2 : 0,
        }}
      />,
    ]
  })

  if (boxes.length === 0) return null

  return (
    <div
      aria-hidden="true"
      className="formula-reference-viewport"
      style={{
        width: metrics.viewportWidth + gutter,
        height: metrics.viewportHeight + heading,
      }}
    >
      {boxes}
    </div>
  )
}
