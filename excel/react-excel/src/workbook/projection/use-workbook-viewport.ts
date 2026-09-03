import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  DEFAULT_MAX_PROJECTION_CELLS,
  projectionSnapshotAtom,
  resetProjectionAtom,
  runVisibleProjectionAtom,
  scrollToCellAtom,
  type CellRange,
  type ProjectionSnapshot,
  type ProjectionStatus,
  type SpreadsheetError,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { useEffect, useMemo } from 'react'

export interface UseWorkbookViewportOptions {
  /** The sheet whose visible cells the caller is rendering. */
  readonly sheetId: string
  /** Caller-owned visible window. */
  readonly window: CellRange
  /** Sheet dimensions used to keep the controlled window in range. */
  readonly rowCount: number
  readonly colCount: number
  /** Caps a visible projection; values above the core default are not accepted. */
  readonly maxCells?: number
}

export interface WorkbookViewport {
  /** The window belonging to the cells currently displayed. */
  readonly window: CellRange
  /** The sheet position used to keep the displayed frame inside the requested viewport. */
  readonly placementWindow: CellRange
  /** Cells from the same projection frame as `window`. */
  readonly cells: ReadonlyArray<VisibleProjectionResult['cells'][number]>
  /** True once this sheet has any projection that can keep the grid mounted. */
  readonly hasResult: boolean
  /** True while an older logical frame is temporarily placed at the requested window. */
  readonly retained: boolean
  readonly status: ProjectionStatus
  readonly error: SpreadsheetError | undefined
  readonly truncated: boolean | undefined
  refresh(): Promise<void>
  /** Requests that a row and column become the visible window's origin. */
  scrollTo(row: number, col: number): void
}

function normalizeCount(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function normalizeIndex(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function normalizeMaxCells(value: number | undefined): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
    return DEFAULT_MAX_PROJECTION_CELLS
  }
  return Math.min(value, DEFAULT_MAX_PROJECTION_CELLS)
}

function clampWindow(
  input: CellRange,
  rowCount: number,
  colCount: number,
  maxCells: number,
): CellRange {
  if (rowCount === 0 || colCount === 0) {
    return { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 }
  }
  if (input.rowEnd < input.rowStart || input.colEnd < input.colStart) {
    return { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 }
  }

  const requestedRows = Math.max(
    1,
    normalizeIndex(input.rowEnd) - normalizeIndex(input.rowStart) + 1,
  )
  const requestedCols = Math.max(
    1,
    normalizeIndex(input.colEnd) - normalizeIndex(input.colStart) + 1,
  )
  const rowSpan = Math.min(rowCount, requestedRows, maxCells)
  const colSpan = Math.min(colCount, requestedCols, Math.max(1, Math.floor(maxCells / rowSpan)))
  const rowStart = clamp(normalizeIndex(input.rowStart), 0, rowCount - rowSpan)
  const colStart = clamp(normalizeIndex(input.colStart), 0, colCount - colSpan)

  return {
    rowStart,
    rowEnd: rowStart + rowSpan - 1,
    colStart,
    colEnd: colStart + colSpan - 1,
  }
}

function sameWindow(left: CellRange, right: CellRange): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd
  )
}

function isCurrentRequest(
  snapshot: ProjectionSnapshot,
  sheetId: string,
  window: CellRange,
): boolean {
  return (
    snapshot.request?.kind === 'visible-window' &&
    snapshot.request.sheetId === sheetId &&
    sameWindow(snapshot.request.window, window)
  )
}

/**
 * Reads a caller-controlled visible window and delegates scrolling back to its owner.
 * Projection state remains in the nearest WorkbookRuntimeProvider's Einfach store.
 */
export function useWorkbookViewport(options: UseWorkbookViewportOptions): WorkbookViewport {
  const snapshot: ProjectionSnapshot = useAtomValue(projectionSnapshotAtom)
  const resetProjection = useSetAtom(resetProjectionAtom)
  const runVisibleProjection = useSetAtom(runVisibleProjectionAtom)
  const scrollToCell = useSetAtom(scrollToCellAtom)
  const { sheetId } = options
  const rowCount = normalizeCount(options.rowCount)
  const colCount = normalizeCount(options.colCount)
  const maxCells = normalizeMaxCells(options.maxCells)
  const controlledRowStart = options.window.rowStart
  const controlledRowEnd = options.window.rowEnd
  const controlledColStart = options.window.colStart
  const controlledColEnd = options.window.colEnd
  const requestedWindow = useMemo(
    () =>
      clampWindow(
        {
          rowStart: controlledRowStart,
          rowEnd: controlledRowEnd,
          colStart: controlledColStart,
          colEnd: controlledColEnd,
        },
        rowCount,
        colCount,
        maxCells,
      ),
    [
      colCount,
      controlledColEnd,
      controlledColStart,
      controlledRowEnd,
      controlledRowStart,
      maxCells,
      rowCount,
    ],
  )
  const { colEnd, colStart, rowEnd, rowStart } = requestedWindow
  useEffect(() => {
    if (rowEnd < rowStart || colEnd < colStart) {
      resetProjection()
      return
    }
    void runVisibleProjection({
      sheetId,
      window: { rowStart, rowEnd, colStart, colEnd },
      reason: 'viewport',
      retainResult: true,
      maxCells,
    })
  }, [maxCells, resetProjection, runVisibleProjection, sheetId, colEnd, colStart, rowEnd, rowStart])

  const refresh = async (): Promise<void> => {
    if (rowEnd < rowStart || colEnd < colStart) return
    const outcome = await runVisibleProjection({
      sheetId,
      window: { rowStart, rowEnd, colStart, colEnd },
      reason: 'viewport',
      retainResult: true,
      maxCells,
    })
    if (outcome.status === 'failed') throw new Error(outcome.error)
    if (outcome.status === 'superseded') throw new Error('Projection refresh was superseded.')
  }

  const scrollTo = (row: number, col: number) => {
    scrollToCell({
      coord: { row, col },
      rowAlign: 'start',
      colAlign: 'start',
    })
  }

  const current = isCurrentRequest(snapshot, sheetId, requestedWindow)
  const result =
    snapshot.result?.kind === 'visible-window' && snapshot.result.sheetId === sheetId
      ? snapshot.result
      : undefined
  const window = result?.window ?? requestedWindow
  const retained = result !== undefined && !sameWindow(result.window, requestedWindow)
  return {
    window,
    placementWindow: retained ? requestedWindow : window,
    cells: result?.cells ?? [],
    hasResult: result !== undefined,
    retained,
    status: current ? snapshot.status : 'idle',
    error: current ? snapshot.error : undefined,
    truncated: result?.truncated,
    refresh,
    scrollTo,
  }
}
