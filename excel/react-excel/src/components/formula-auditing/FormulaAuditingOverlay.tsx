import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeSheetTraceArrowsAtom,
  activeWorkbookSheetAtom,
  coordToA1,
  projectedFreezeAtom,
  rangeToA1,
  runTraceAuditingAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
  type CellRange,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLingui } from '@lingui/react/macro'
import type { JSX } from 'react'
import { selectionEdgeGeometry } from '../../workbook/drag-move/selection-edge-geometry'
import {
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT,
  workbookViewportMetrics,
} from '../../workbook/grid/viewport/workbook-grid-config'
import './formula-auditing.css'

export function FormulaAuditingOverlay(): JSX.Element | null {
  const { t } = useLingui()
  const arrows = useAtomValue(activeSheetTraceArrowsAtom)
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const viewportMetrics = useAtomValue(viewportMetricsAtom)
  const sizeOverrides = useAtomValue(viewportGeometrySizesAtom)
  const projectedFreeze = useAtomValue(projectedFreezeAtom)
  const runTrace = useSetAtom(runTraceAuditingAtom)

  if (!activeSheet || arrows.length === 0) return null

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
  const gutter = WORKBOOK_GRID_ROW_HEADER_WIDTH
  const heading = WORKBOOK_GRID_ROW_HEIGHT

  const rangeRect = (range: CellRange) => {
    const frame = selectionEdgeGeometry(range, metrics, sizeOverrides, freeze)
    if (frame.width <= 0 || frame.height <= 0) return null
    return {
      left: frame.left + gutter,
      top: frame.top + heading,
      width: frame.width,
      height: frame.height,
    }
  }

  return (
    <div
      className="formula-auditing-overlay-root"
      data-auditing-overlay="true"
      style={{
        width: metrics.viewportWidth + gutter,
        height: metrics.viewportHeight + heading,
      }}
    >
      <svg className="formula-auditing-svg" aria-hidden="true">
        <defs>
          <marker
            id="auditing-arrow-blue"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#2563eb" />
          </marker>
          <marker
            id="auditing-arrow-red"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#dc2626" />
          </marker>
        </defs>
        {arrows.map((arrow) => {
          const stroke = arrow.isError ? '#dc2626' : '#2563eb'
          const markerEnd = arrow.isError
            ? 'url(#auditing-arrow-red)'
            : 'url(#auditing-arrow-blue)'
          const toRange: CellRange = {
            rowStart: arrow.toCell.row,
            rowEnd: arrow.toCell.row,
            colStart: arrow.toCell.col,
            colEnd: arrow.toCell.col,
          }

          if (!arrow.isCrossSheet) {
            const fromRect = rangeRect(arrow.fromRange)
            const toRect = rangeRect(toRange)
            if (!fromRect || !toRect) return null
            const x1 = fromRect.left + fromRect.width / 2
            const y1 = fromRect.top + fromRect.height / 2
            const x2 = toRect.left + toRect.width / 2
            const y2 = toRect.top + toRect.height / 2
            const isMultiCell =
              arrow.fromRange.rowStart !== arrow.fromRange.rowEnd ||
              arrow.fromRange.colStart !== arrow.fromRange.colEnd

            return (
              <g
                key={arrow.id}
                data-auditing-arrow={arrow.id}
                data-auditing-direction={arrow.direction}
                data-auditing-error={arrow.isError ? 'true' : 'false'}
                data-auditing-level={String(arrow.level)}
              >
                {isMultiCell ? (
                  <rect
                    x={fromRect.left + 1}
                    y={fromRect.top + 1}
                    width={Math.max(0, fromRect.width - 2)}
                    height={Math.max(0, fromRect.height - 2)}
                    fill="rgba(37, 99, 235, 0.06)"
                    stroke={stroke}
                    strokeWidth={1.5}
                    rx={2}
                  />
                ) : null}
                <circle cx={x1} cy={y1} r={3.5} fill={stroke} />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth={2}
                  markerEnd={markerEnd}
                />
              </g>
            )
          }

          if (arrow.toSheetId === activeSheet.id) {
            const toRect = rangeRect(toRange)
            if (!toRect) return null
            const x2 = toRect.left + toRect.width / 2
            const y2 = toRect.top + toRect.height / 2
            const x1 = Math.max(gutter + 24, x2 - 54)
            const y1 = Math.max(heading + 12, y2 - 24)
            return (
              <g
                key={arrow.id}
                data-auditing-arrow={arrow.id}
                data-auditing-direction={arrow.direction}
                data-auditing-error={arrow.isError ? 'true' : 'false'}
                data-auditing-cross="precedent"
              >
                <circle cx={x1} cy={y1} r={3.5} fill={stroke} />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth={1.8}
                  strokeDasharray="4 3"
                  markerEnd={markerEnd}
                />
              </g>
            )
          }

          if (arrow.fromSheetId === activeSheet.id) {
            const fromRect = rangeRect(arrow.fromRange)
            if (!fromRect) return null
            const x1 = fromRect.left + fromRect.width / 2
            const y1 = fromRect.top + fromRect.height / 2
            const x2 = x1 + 54
            const y2 = Math.max(heading + 12, y1 - 24)
            return (
              <g
                key={arrow.id}
                data-auditing-arrow={arrow.id}
                data-auditing-direction={arrow.direction}
                data-auditing-error={arrow.isError ? 'true' : 'false'}
                data-auditing-cross="dependent"
              >
                <circle cx={x1} cy={y1} r={3.5} fill={stroke} />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth={1.8}
                  strokeDasharray="4 3"
                  markerEnd={markerEnd}
                />
              </g>
            )
          }

          return null
        })}
      </svg>

      {arrows.map((arrow) => {
        if (!arrow.isCrossSheet) return null
        const toRange: CellRange = {
          rowStart: arrow.toCell.row,
          rowEnd: arrow.toCell.row,
          colStart: arrow.toCell.col,
          colEnd: arrow.toCell.col,
        }

        if (arrow.toSheetId === activeSheet.id) {
          const toRect = rangeRect(toRange)
          if (!toRect) return null
          const x = Math.max(gutter + 32, toRect.left + toRect.width / 2 - 58)
          const y = Math.max(heading + 10, toRect.top + toRect.height / 2 - 28)
          const label = `${arrow.fromSheetName}!${rangeToA1(arrow.fromRange)}`
          return (
            <button
              key={`badge-${arrow.id}`}
              type="button"
              className="formula-auditing-cross-sheet-badge"
              data-auditing-cross-sheet="precedent"
              data-error={arrow.isError ? 'true' : 'false'}
              style={{ left: `${x}px`, top: `${y}px` }}
              title={t`Jump to ${label}`}
              onClick={() => {
                void runTrace({
                  navigate: {
                    sheetId: arrow.fromSheetId,
                    row: arrow.fromRange.rowStart,
                    col: arrow.fromRange.colStart,
                  },
                })
              }}
            >
              <span>⊞</span>
              <span>{label}</span>
            </button>
          )
        }

        if (arrow.fromSheetId === activeSheet.id) {
          const fromRect = rangeRect(arrow.fromRange)
          if (!fromRect) return null
          const x = fromRect.left + fromRect.width / 2 + 58
          const y = Math.max(heading + 10, fromRect.top + fromRect.height / 2 - 28)
          const label = `${arrow.toSheetName}!${coordToA1(arrow.toCell)}`
          return (
            <button
              key={`badge-${arrow.id}`}
              type="button"
              className="formula-auditing-cross-sheet-badge"
              data-auditing-cross-sheet="dependent"
              data-error={arrow.isError ? 'true' : 'false'}
              style={{ left: `${x}px`, top: `${y}px` }}
              title={t`Jump to ${label}`}
              onClick={() => {
                void runTrace({
                  navigate: {
                    sheetId: arrow.toSheetId,
                    row: arrow.toCell.row,
                    col: arrow.toCell.col,
                  },
                })
              }}
            >
              <span>⊞</span>
              <span>{label}</span>
            </button>
          )
        }

        return null
      })}
    </div>
  )
}
