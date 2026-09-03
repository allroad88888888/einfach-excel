import type {
  ProjectionRequestId,
  ProjectionRevision,
  ViewportColumnWidth,
  ViewportRowHeight,
  ViewportSizeProjectionResult,
} from '../backend/types'
import type { CellRange } from '../shared'
import {
  MAX_VIEWPORT_COL_WIDTH,
  MAX_VIEWPORT_ROW_HEIGHT,
  MIN_VIEWPORT_COL_WIDTH,
  MIN_VIEWPORT_ROW_HEIGHT,
} from './size-overrides'

export interface ViewportSizeProjectionExpectation {
  readonly sheetId: string
  readonly requestId: ProjectionRequestId
  readonly window: Readonly<CellRange>
}

export type CanonicalViewportSizes = Readonly<{
  rowHeights: readonly Readonly<ViewportRowHeight>[]
  colWidths: readonly Readonly<ViewportColumnWidth>[]
}>

/** Copies and validates a projection window before it crosses an async boundary. */
export function snapshotSizeWindow(value: unknown): Readonly<CellRange> | null {
  if (typeof value !== 'object' || value === null) return null
  const { rowStart, rowEnd, colStart, colEnd } = value as Partial<CellRange>
  if (
    !Number.isSafeInteger(rowStart) ||
    !Number.isSafeInteger(rowEnd) ||
    !Number.isSafeInteger(colStart) ||
    !Number.isSafeInteger(colEnd) ||
    (rowStart as number) < 0 ||
    (colStart as number) < 0 ||
    (rowStart as number) > (rowEnd as number) ||
    (colStart as number) > (colEnd as number)
  ) {
    return null
  }
  return Object.freeze({ rowStart, rowEnd, colStart, colEnd } as CellRange)
}

/** Accepts only the exact request response and canonical row/column slices. */
export function matchingCanonicalViewportSizes(
  value: unknown,
  expected: ViewportSizeProjectionExpectation,
): CanonicalViewportSizes | null {
  if (typeof value !== 'object' || value === null) return null
  const result = value as Partial<ViewportSizeProjectionResult>
  if (
    result.kind !== 'viewport-size' ||
    result.sheetId !== expected.sheetId ||
    result.requestId !== expected.requestId ||
    !isProjectionRevision(result.revision) ||
    !result.window ||
    !windowsMatch(result.window, expected.window)
  ) {
    return null
  }

  const rowHeights = snapshotCanonicalRowHeights(result.rowHeights, expected.window)
  const colWidths = snapshotCanonicalColumnWidths(result.colWidths, expected.window)
  return rowHeights && colWidths ? Object.freeze({ rowHeights, colWidths }) : null
}

/** Replaces only the requested row window while preserving cached rows outside it. */
export function reconcileRowHeightWindow(
  current: Readonly<Record<string, number>>,
  canonical: readonly Readonly<ViewportRowHeight>[],
  lower: number,
  upper: number,
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const [key, value] of Object.entries(current)) {
    const index = Number(key)
    if (!Number.isSafeInteger(index) || index < lower || index > upper) next[key] = value
  }
  for (const entry of canonical) next[String(entry.rowIndex)] = entry.heightPx
  return next
}

/** Replaces only the requested column window while preserving cached columns outside it. */
export function reconcileColumnWidthWindow(
  current: Readonly<Record<string, number>>,
  canonical: readonly Readonly<ViewportColumnWidth>[],
  lower: number,
  upper: number,
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const [key, value] of Object.entries(current)) {
    const index = Number(key)
    if (!Number.isSafeInteger(index) || index < lower || index > upper) next[key] = value
  }
  for (const entry of canonical) next[String(entry.colIndex)] = entry.widthPx
  return next
}

function windowsMatch(left: Readonly<CellRange>, right: Readonly<CellRange>): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd
  )
}

function isProjectionRevision(value: unknown): value is ProjectionRevision {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length > 0)
  )
}

function snapshotCanonicalRowHeights(
  value: unknown,
  range: Readonly<CellRange>,
): readonly Readonly<ViewportRowHeight>[] | null {
  if (!Array.isArray(value)) return null
  const canonical: Readonly<ViewportRowHeight>[] = []
  let previousIndex = -1
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { rowIndex, heightPx } = entry as Partial<ViewportRowHeight>
    if (
      !Number.isSafeInteger(rowIndex) ||
      (rowIndex as number) <= previousIndex ||
      (rowIndex as number) < range.rowStart ||
      (rowIndex as number) > range.rowEnd ||
      typeof heightPx !== 'number' ||
      !Number.isFinite(heightPx) ||
      heightPx < MIN_VIEWPORT_ROW_HEIGHT ||
      heightPx > MAX_VIEWPORT_ROW_HEIGHT
    ) {
      return null
    }
    canonical.push(Object.freeze({ rowIndex, heightPx } as ViewportRowHeight))
    previousIndex = rowIndex as number
  }
  return Object.freeze(canonical)
}

function snapshotCanonicalColumnWidths(
  value: unknown,
  range: Readonly<CellRange>,
): readonly Readonly<ViewportColumnWidth>[] | null {
  if (!Array.isArray(value)) return null
  const canonical: Readonly<ViewportColumnWidth>[] = []
  let previousIndex = -1
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { colIndex, widthPx } = entry as Partial<ViewportColumnWidth>
    if (
      !Number.isSafeInteger(colIndex) ||
      (colIndex as number) <= previousIndex ||
      (colIndex as number) < range.colStart ||
      (colIndex as number) > range.colEnd ||
      typeof widthPx !== 'number' ||
      !Number.isFinite(widthPx) ||
      widthPx < MIN_VIEWPORT_COL_WIDTH ||
      widthPx > MAX_VIEWPORT_COL_WIDTH
    ) {
      return null
    }
    canonical.push(Object.freeze({ colIndex, widthPx } as ViewportColumnWidth))
    previousIndex = colIndex as number
  }
  return Object.freeze(canonical)
}
