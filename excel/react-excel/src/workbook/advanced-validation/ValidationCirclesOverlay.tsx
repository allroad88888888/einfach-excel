import { useEffect, useId, useMemo } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import {
  activeWorkbookSheetAtom,
  getViewportRangeRectangle,
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

type CircleRegion = 'corner' | 'top' | 'left' | 'body'

interface FreezeBounds {
  readonly rows: number
  readonly cols: number
  readonly width: number
  readonly height: number
}

export interface PaneValidationCirclesProps {
  readonly scrollTop: number
  readonly scrollLeft: number
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly gutter: number
  readonly heading: number
  readonly freeze: FreezeBounds | null
  readonly mergedRanges?: readonly CellRange[]
  readonly showStatus?: boolean
}

interface CircleOval {
  readonly key: string
  readonly region: CircleRegion
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
}

const REGIONS: readonly CircleRegion[] = ['corner', 'top', 'left', 'body']

export function PaneValidationCircles({
  scrollTop,
  scrollLeft,
  viewportWidth,
  viewportHeight,
  gutter,
  heading,
  freeze,
  mergedRanges,
  showStatus = false,
}: PaneValidationCirclesProps) {
  const { t } = useLingui()
  const clipPrefix = useId()
  const circles = useAtomValue(validationCirclesAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const baseMetrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)

  const mergeByAnchor = useMemo(() => {
    const map = new Map<string, CellRange>()
    if (!mergedRanges) return map
    for (const range of mergedRanges) {
      map.set(`${range.rowStart}:${range.colStart}`, range)
    }
    return map
  }, [mergedRanges])

  if (!circles.active || !sheet) return null

  const metrics = {
    ...baseMetrics,
    sheetId: sheet.id,
    rowCount: sheet.rowCount,
    colCount: sheet.colCount,
    scrollTop,
    scrollLeft,
    viewportWidth,
    viewportHeight,
  }
  const frozenRows = freeze?.rows ?? 0
  const frozenCols = freeze?.cols ?? 0
  const frozenWidth = freeze?.width ?? 0
  const frozenHeight = freeze?.height ?? 0
  const bodyWidth = Math.max(0, viewportWidth - frozenWidth)
  const bodyHeight = Math.max(0, viewportHeight - frozenHeight)

  const clipBoxes: Record<CircleRegion, { x: number; y: number; w: number; h: number }> = {
    corner: { x: gutter, y: heading, w: frozenWidth, h: frozenHeight },
    top: { x: gutter + frozenWidth, y: heading, w: bodyWidth, h: frozenHeight },
    left: { x: gutter, y: heading + frozenHeight, w: frozenWidth, h: bodyHeight },
    body: { x: gutter + frozenWidth, y: heading + frozenHeight, w: bodyWidth, h: bodyHeight },
  }

  const ovals: CircleOval[] = circles.cells.flatMap(({ row, col }) => {
    const key = `${row}:${col}`
    const range = mergeByAnchor.get(key) ?? {
      rowStart: row,
      rowEnd: row,
      colStart: col,
      colEnd: col,
    }
    const rect = getViewportRangeRectangle(metrics, sizes, range)
    if (rect.width <= 0 || rect.height <= 0) return []
    const inFrozenRow = range.rowStart < frozenRows
    const inFrozenCol = range.colStart < frozenCols
    const region: CircleRegion = inFrozenRow
      ? inFrozenCol
        ? 'corner'
        : 'top'
      : inFrozenCol
        ? 'left'
        : 'body'
    const box = clipBoxes[region]
    if (box.w <= 0 || box.h <= 0) return []
    const cellLeft = gutter + (inFrozenCol ? rect.left : rect.left - scrollLeft)
    const cellTop = heading + (inFrozenRow ? rect.top : rect.top - scrollTop)
    const cx = cellLeft + rect.width / 2
    const cy = cellTop + rect.height / 2
    const rx = Math.max(4, rect.width / 2 + 2)
    const ry = Math.max(4, rect.height / 2 + 2)
    if (
      cx + rx + 2 < box.x ||
      cx - rx - 2 > box.x + box.w ||
      cy + ry + 2 < box.y ||
      cy - ry - 2 > box.y + box.h
    ) {
      return []
    }
    return [{ key, region, cx, cy, rx, ry }]
  })

  const width = viewportWidth + gutter
  const height = viewportHeight + heading
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
      {showStatus && statusText && (
        <span className="validation-circles-status" role="status" aria-live="polite">
          {statusText}
        </span>
      )}
      {showStatus && circles.truncated && !circles.busy && statusText && (
        <div
          className="validation-circles-banner"
          data-validation-circles-truncated="true"
          style={{ top: heading + 6 }}
        >
          {statusText}
        </div>
      )}
      {ovals.length > 0 && (
        <svg className="validation-circle-svg" aria-hidden="true" width={width} height={height}>
          <defs>
            {REGIONS.map((region) => {
              const box = clipBoxes[region]
              if (box.w <= 0 || box.h <= 0) return null
              return (
                <clipPath key={region} id={`${clipPrefix}-${region}`}>
                  <rect x={box.x} y={box.y} width={box.w} height={box.h} />
                </clipPath>
              )
            })}
          </defs>
          {REGIONS.map((region) => {
            const regionOvals = ovals.filter((item) => item.region === region)
            if (regionOvals.length === 0) return null
            return (
              <g key={region} clipPath={`url(#${clipPrefix}-${region})`}>
                {regionOvals.map((oval) => (
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
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

export function ValidationCirclesOverlay({
  mergedRanges,
}: {
  readonly mergedRanges?: readonly CellRange[]
}) {
  const circles = useAtomValue(validationCirclesAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const run = useSetAtom(runValidationCirclesAtom)
  const { gutter, heading } = useGridGutter()

  const projectedRevision =
    projection.status === 'ready' && projection.result?.sheetId === sheet?.id
      ? projection.result?.revision ?? null
      : null

  useEffect(() => {
    if (
      !circles.active ||
      circles.busy ||
      projectedRevision === null ||
      circles.failedRevision === projectedRevision
    ) {
      return
    }
    if (circles.revision !== projectedRevision) {
      void run('refresh')
    }
  }, [
    circles.active,
    circles.busy,
    circles.failedRevision,
    circles.revision,
    projectedRevision,
    run,
  ])

  if (!circles.active || !sheet || metrics.sheetId !== sheet.id) return null

  const activeFreeze = freeze?.sheetId === sheet.id ? freeze : null
  return (
    <PaneValidationCircles
      scrollTop={metrics.scrollTop}
      scrollLeft={metrics.scrollLeft}
      viewportWidth={metrics.viewportWidth}
      viewportHeight={metrics.viewportHeight}
      gutter={gutter}
      heading={heading}
      freeze={activeFreeze}
      mergedRanges={mergedRanges}
      showStatus={true}
    />
  )
}
