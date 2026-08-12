import type { Store } from '@einfach/core'
import {
  beginProjectionAtom,
  rejectProjectionAtom,
  resolveProjectionAtom,
  selectionSnapshotAtom,
  workspaceSessionAtom,
  type AutoFillControllerPort,
  type CellRange,
  type RangeProjectionResult,
  type SortDirection,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

export interface MenuBarCommandContext {
  readonly backend: SpreadsheetBackend
  readonly store: Store
  getActiveSheetId: () => string | null
  createAutoFillController: () => AutoFillControllerPort
  requestSortConfirmation: (direction: SortDirection) => void
}

/** Builds the shared Core-backed facts needed by menu command adapters. */
export function createMenuBarCommandContext(
  store: Store,
  backend: SpreadsheetBackend,
  requestSortConfirmation: (direction: SortDirection) => void,
): MenuBarCommandContext {
  function getActiveSheetId(): string | null {
    const snapshot = store.getter(selectionSnapshotAtom)
    if (snapshot.selection.sheetId) return snapshot.selection.sheetId
    return store.getter(workspaceSessionAtom).activeSheetId ?? null
  }

  async function readAutoFillRangeProjection(
    sheetId: string,
    range: Readonly<CellRange>,
  ): Promise<RangeProjectionResult | null> {
    const begin = store.setter(beginProjectionAtom, {
      kind: 'range',
      sheetId,
      range: { ...range },
      reason: 'toolbar',
    })
    if (begin.status !== 'started' || begin.request.kind !== 'range') return null

    const request = begin.request
    try {
      const result = await backend.readRangeProjection(request)
      const outcome = store.setter(resolveProjectionAtom, { request, result })
      return outcome.status === 'accepted' && outcome.result.kind === 'range'
        ? outcome.result
        : null
    } catch (error) {
      store.setter(rejectProjectionAtom, { request, error })
      throw error
    }
  }

  function createAutoFillController(): AutoFillControllerPort {
    return {
      readRangeProjection: readAutoFillRangeProjection,
      setCellInput: (request) => backend.setCellInput(request),
      ...(backend.fillSeries ? { fillSeries: (request) => backend.fillSeries!(request) } : {}),
      ...(backend.fillRange ? { fillRange: (request) => backend.fillRange!(request) } : {}),
      ...(backend.importCells ? { importCells: (request) => backend.importCells!(request) } : {}),
      ...(backend.resolveDataEdge
        ? { resolveDataEdge: (request) => backend.resolveDataEdge!(request) }
        : {}),
    }
  }

  return { backend, store, getActiveSheetId, createAutoFillController, requestSortConfirmation }
}
