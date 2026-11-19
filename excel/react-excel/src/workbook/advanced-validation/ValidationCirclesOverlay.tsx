import { useEffect, useMemo } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import {
  activeWorkbookSheetAtom,
  getRangeScreenRectangle,
  projectedFreezeAtom,
  projectionSnapshotAtom,
  runValidationCirclesAtom,
  validationCirclesAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
  type CellRange,
} from '@einfach-excel/spreadsheet-ui-core'
import { useGridGutter } from '../grid/viewport/grid-gutter'
import './validation-circles.css'

export function ValidationCirclesOverlay({
  mergedRanges,
}: {
  readonly mergedRanges?: readonly CellRange[]
}) {
  const { t } = useLingui()
  const circles = useAtomValue(validationCirclesAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const run = useSetAtom(runValidationCirclesAtom)
  const { gutter, heading } = useGridGutter()

  const projectedRevision =
    projection.status === 'ready' && projection.result?.sheetId === sheet?.id
      ? projection.result?.revision ?? null
      : null

  useEffect(() => {
    if (!circles.active || circles.busy || projectedRevision === null) return
    if (circles.revision !== projectedRevision) {
      void run('refresh')
    }
  }, [circles.active, circles.busy, circles.revision, projectedRevision, run])

  const mergeByAnchor = useMemo(() => {
    const map = new Map<string, CellRange>()
    if (!mergedRanges) return map
    for (const range of mergedRanges) {
      map.set(`${range.rowStart}:${range.colStart}`, range)
    }
    return map
  }, [mergedRanges])

  if (!circles.active || !sheet || metrics.sheetId !== sheet.id) return null

  const activeFreeze = freeze?.sheetId === sheet.id ? freeze : null
  const width = metrics.viewportWidth + gutter
  const height = metrics.viewportHeight + heading

  const ovals = circles.cells.flatMap(({ row, col }) => {
    const key = `${row}:${col}`
    const range = mergeByAnchor.get(key) ?? {
      rowStart: row,
      rowEnd: row,
      colStart: col,
      colEnd: col,
    }
    const frame = getRangeScreenRectangle(range, metrics, sizes, activeFreeze)
    if (frame.width <= 0 || frame.height <= 0) return []
    const cx = frame.left + gutter + frame.width / 2
    const cy = frame.top + heading + frame.height / 2
    const rx = Math.max(4, frame.width / 2 + 2)
    const ry = Math.max(4, frame.height / 2 + 2)
    return [{ key, cx, cy, rx, ry }]
  })

  const count = circles.cells.length
  const statusText = circles.busy
    ? ''
    : count === 0
      ? t`No invalid cells found.`
      : circles.truncated
        ? t`Showing first ${count} invalid cells.`
        : t`${count} invalid cells circled.`

  return (
    <div
      className="validation-circles-layer"
      data-validation-circles-count={count}
      style={{ width, height }}
    >
      {statusText && (
        <span className="validation-circles-status" role="status" aria-live="polite">
          {statusText}
        </span>
      )}
      {ovals.length > 0 && (
        <svg className="validation-circle-svg" aria-hidden="true" width={width} height={height}>
          {ovals.map((oval) => (
            <ellipse
              key={oval.key}
              className="validation-circle-ellipse"
              data-validation-circle={oval.key}
              cx={oval.cx}
              cy={oval.cy}
              rx={oval.rx}
              ry={oval.ry}
            />
          ))}
        </svg>
      )}
    </div>
  )
}
