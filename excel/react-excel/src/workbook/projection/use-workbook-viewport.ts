import type { Store } from '@einfach/core'
import {
  beginProjectionAtom,
  DEFAULT_MAX_PROJECTION_CELLS,
  projectionSnapshotAtom,
  rejectProjectionAtom,
  resolveProjectionAtom,
  resetProjectionAtom,
  type CellRange,
  type ProjectionSnapshot,
  type ProjectionStatus,
  type SpreadsheetError,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useWorkbookRuntime } from '../runtime/use-workbook-runtime'
import { useStoreValue, type StoreValueSource } from '../runtime/use-store-value'

export interface UseWorkbookViewportOptions {
  /** The sheet whose visible cells the caller is rendering. */
  readonly sheetId: string
  /** Caller-owned visible window. */
  readonly window: CellRange
  /** Sheet dimensions used to keep the controlled window in range. */
  readonly rowCount: number
  readonly colCount: number
  /** Receives a clamped window when `scrollTo` requests a new origin. */
  readonly onWindowChange: (window: CellRange) => void
  /** Caps a visible projection; values above the core default are not accepted. */
  readonly maxCells?: number
}

export interface WorkbookViewport {
  /** The bounded form of the caller-owned window. */
  readonly window: CellRange
  /** Cells only for the current controlled window. */
  readonly cells: ReadonlyArray<VisibleProjectionResult['cells'][number]>
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

function isCurrentResult(
  snapshot: ProjectionSnapshot,
  sheetId: string,
  window: CellRange,
): boolean {
  return (
    snapshot.result?.kind === 'visible-window' &&
    snapshot.result.sheetId === sheetId &&
    sameWindow(snapshot.result.window, window)
  )
}

function createProjectionSource(store: Store): StoreValueSource<ProjectionSnapshot> {
  return {
    getSnapshot: () => store.getter(projectionSnapshotAtom),
    subscribe: (onStoreChange) => store.sub(projectionSnapshotAtom, onStoreChange),
  }
}

async function runVisibleProjectionTransport(
  store: Store,
  backend: {
    readVisibleProjection: (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
  },
  initialRequest: VisibleProjectionRequest,
): Promise<void> {
  let request = initialRequest
  while (true) {
    try {
      const result = await backend.readVisibleProjection(request)
      const outcome = store.setter(resolveProjectionAtom, { request, result })
      if (outcome.nextRequest?.kind === 'visible-window') {
        request = outcome.nextRequest
        continue
      }
      if (outcome.status !== 'accepted') {
        throw new Error('Projection result did not match the active request.')
      }
      return
    } catch (error) {
      const outcome = store.setter(rejectProjectionAtom, { request, error })
      if (outcome.status === 'rejected' && outcome.nextRequest?.kind === 'visible-window') {
        request = outcome.nextRequest
        continue
      }
      throw error
    }
  }
}

/**
 * Reads a caller-controlled visible window and delegates scrolling back to its owner.
 * Projection state remains in the nearest WorkbookRuntimeProvider's Einfach store.
 */
export function useWorkbookViewport(
  options: UseWorkbookViewportOptions,
): WorkbookViewport {
  const core = useWorkbookRuntime()
  const { onWindowChange, sheetId } = options
  const rowCount = normalizeCount(options.rowCount)
  const colCount = normalizeCount(options.colCount)
  const maxCells = normalizeMaxCells(options.maxCells)
  const controlledRowStart = options.window.rowStart
  const controlledRowEnd = options.window.rowEnd
  const controlledColStart = options.window.colStart
  const controlledColEnd = options.window.colEnd
  const window = useMemo(
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
  const { colEnd, colStart, rowEnd, rowStart } = window
  const source = useMemo(() => createProjectionSource(core.store), [core.store])
  const snapshot = useStoreValue(source)
  const transportRef = useRef<Promise<void> | null>(null)
  const launchTransport = useCallback(
    (request: VisibleProjectionRequest): Promise<void> => {
      const transport = runVisibleProjectionTransport(core.store, core.backend, request)
      transportRef.current = transport
      void transport.catch(() => undefined).finally(() => {
        if (transportRef.current === transport) transportRef.current = null
      })
      return transport
    },
    [core.backend, core.store],
  )

  useEffect(() => {
    if (rowEnd < rowStart || colEnd < colStart) {
      core.store.setter(resetProjectionAtom)
      return
    }
    const begin = core.store.setter(beginProjectionAtom, {
      kind: 'visible-window',
      sheetId,
      window: { rowStart, rowEnd, colStart, colEnd },
      reason: 'viewport',
      maxCells,
    })
    if (begin.status !== 'started' || begin.request.kind !== 'visible-window') return
    void launchTransport(begin.request).catch(() => undefined)
  }, [core.store, launchTransport, maxCells, sheetId, colEnd, colStart, rowEnd, rowStart])

  const refresh = useCallback(async (): Promise<void> => {
    if (rowEnd < rowStart || colEnd < colStart) return
    const begin = core.store.setter(beginProjectionAtom, {
      kind: 'visible-window',
      sheetId,
      window: { rowStart, rowEnd, colStart, colEnd },
      reason: 'viewport',
      retainResult: true,
      maxCells,
    })
    if (begin.status === 'invalid' || begin.status === 'exhausted') {
      throw new Error(begin.error.message)
    }
    if ((begin.status !== 'started' && begin.status !== 'queued') || begin.request.kind !== 'visible-window') return
    const transport = begin.status === 'started' ? launchTransport(begin.request) : transportRef.current
    if (transport === null) throw new Error('Projection refresh transport is unavailable.')
    await transport

    const refreshed = core.store.getter(projectionSnapshotAtom)
    if (
      refreshed.status !== 'ready' ||
      refreshed.request?.requestId !== begin.request.requestId ||
      !isCurrentResult(refreshed, sheetId, window)
    ) {
      throw new Error(refreshed.error?.message ?? 'Projection refresh was superseded.')
    }
  }, [core.store, launchTransport, maxCells, sheetId, colEnd, colStart, rowEnd, rowStart, window])

  const scrollTo = useCallback(
    (row: number, col: number) => {
      const rowSpan = rowEnd - rowStart + 1
      const colSpan = colEnd - colStart + 1
      onWindowChange(
        clampWindow(
          {
            rowStart: row,
            rowEnd: row + rowSpan - 1,
            colStart: col,
            colEnd: col + colSpan - 1,
          },
          rowCount,
          colCount,
          maxCells,
        ),
      )
    },
    [colCount, colEnd, colStart, maxCells, onWindowChange, rowCount, rowEnd, rowStart],
  )

  const current = isCurrentRequest(snapshot, sheetId, window)
  const result = current && isCurrentResult(snapshot, sheetId, window) ? snapshot.result : undefined
  return {
    window,
    cells: result?.cells ?? [],
    status: current ? snapshot.status : 'idle',
    error: current ? snapshot.error : undefined,
    truncated: result?.truncated,
    refresh,
    scrollTo,
  }
}
