import type { Store } from '@einfach/core'
import {
  beginProjectionAtom,
  DEFAULT_MAX_PROJECTION_CELLS,
  projectionSnapshotAtom,
  rejectProjectionAtom,
  resetProjectionAtom,
  resolveProjectionAtom,
  type CellRange,
  type ProjectionSnapshot,
  type ProjectionStatus,
  type SpreadsheetBackend,
  type SpreadsheetError,
  type SpreadsheetUiCore,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { computed, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

/** Caller-owned inputs for a bounded visible projection. */
export interface UseSpreadsheetViewportOptions {
  readonly sheetId: MaybeRefOrGetter<string>
  readonly window: MaybeRefOrGetter<CellRange>
  readonly rowCount: MaybeRefOrGetter<number>
  readonly colCount: MaybeRefOrGetter<number>
  readonly onWindowChange: (window: CellRange) => void
  readonly maxCells?: MaybeRefOrGetter<number | undefined>
}

/** Reactive view of the current caller-controlled visible projection. */
export interface UseSpreadsheetViewportResult {
  readonly window: ComputedRef<CellRange>
  readonly cells: ComputedRef<readonly VisibleProjectionResult['cells'][number][]>
  readonly status: ComputedRef<ProjectionStatus>
  readonly error: ComputedRef<SpreadsheetError | undefined>
  readonly truncated: ComputedRef<boolean | undefined>
  scrollTo: (row: number, col: number) => void
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
  if (!Number.isSafeInteger(value) || value === undefined || value < 1) {
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

function isEmptyWindow(window: CellRange): boolean {
  return window.rowEnd < window.rowStart || window.colEnd < window.colStart
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

function createProjectionSource(
  core: ComputedRef<SpreadsheetUiCore>,
): SpreadsheetValueSource<ProjectionSnapshot> {
  return {
    getSnapshot: () => core.value.store.getter(projectionSnapshotAtom),
    subscribe: (onStoreChange) => {
      let activeStore: Store | undefined
      let unsubscribe: () => void = () => undefined
      const stop = watch(
        core,
        (nextCore) => {
          if (nextCore.store === activeStore) return
          unsubscribe()
          activeStore = nextCore.store
          unsubscribe = nextCore.store.sub(projectionSnapshotAtom, onStoreChange)
          onStoreChange()
        },
        { immediate: true },
      )

      return () => {
        stop()
        unsubscribe()
      }
    },
  }
}

async function runVisibleProjectionTransport(
  store: Store,
  backend: Pick<SpreadsheetBackend, 'readVisibleProjection'>,
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
      return
    } catch (error) {
      const outcome = store.setter(rejectProjectionAtom, { request, error })
      if (outcome.status === 'rejected' && outcome.nextRequest?.kind === 'visible-window') {
        request = outcome.nextRequest
        continue
      }
      return
    }
  }
}

/**
 * Reads a controlled visible window through the nearest SpreadsheetUiProvider.
 * Projection state stays in the provider's UI Core store; this bridge only
 * clamps caller input and delegates scroll ownership back to the caller.
 */
export function useSpreadsheetViewport(
  options: UseSpreadsheetViewportOptions,
): UseSpreadsheetViewportResult {
  const core = useSpreadsheetUiCore()
  const rowCount = computed(() => normalizeCount(toValue(options.rowCount)))
  const colCount = computed(() => normalizeCount(toValue(options.colCount)))
  const maxCells = computed(() =>
    normalizeMaxCells(options.maxCells === undefined ? undefined : toValue(options.maxCells)),
  )
  const window = computed(() =>
    clampWindow(toValue(options.window), rowCount.value, colCount.value, maxCells.value),
  )
  const projection = useSpreadsheetValue(createProjectionSource(core))

  watch(
    [core, window, maxCells, () => toValue(options.sheetId)],
    ([activeCore, activeWindow, activeMaxCells, sheetId]) => {
      if (isEmptyWindow(activeWindow)) {
        activeCore.store.setter(resetProjectionAtom)
        return
      }

      const begin = activeCore.store.setter(beginProjectionAtom, {
        kind: 'visible-window',
        sheetId,
        window: activeWindow,
        reason: 'viewport',
        maxCells: activeMaxCells,
      })
      if (begin.status !== 'started' || begin.request.kind !== 'visible-window') return
      void runVisibleProjectionTransport(activeCore.store, activeCore.backend, begin.request)
    },
    { immediate: true },
  )

  const current = computed(() =>
    isCurrentRequest(projection.value.value, toValue(options.sheetId), window.value),
  )
  const result = computed(() => {
    if (!current.value) return undefined
    return isCurrentResult(projection.value.value, toValue(options.sheetId), window.value)
      ? projection.value.value.result
      : undefined
  })

  return {
    window,
    cells: computed(() => result.value?.cells ?? []),
    status: computed(() => (current.value ? projection.value.value.status : 'idle')),
    error: computed(() => (current.value ? projection.value.value.error : undefined)),
    truncated: computed(() => result.value?.truncated),
    scrollTo(row, col) {
      const rowSpan = window.value.rowEnd - window.value.rowStart + 1
      const colSpan = window.value.colEnd - window.value.colStart + 1
      options.onWindowChange(
        clampWindow(
          {
            rowStart: row,
            rowEnd: row + rowSpan - 1,
            colStart: col,
            colEnd: col + colSpan - 1,
          },
          rowCount.value,
          colCount.value,
          maxCells.value,
        ),
      )
    },
  }
}
