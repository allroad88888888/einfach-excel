// 一句话：把 worker 的 cellsDirty 事件放行成宿主内容变更通知。

import type { CellRefWire, SparseRangeWire } from '../worker-protocol'
import { bumpRevision } from './revision'
import { parseA1 } from './wire-range'
import type { WorkerBackendState } from './state'

export function notifyContentChangeHandlers(state: WorkerBackendState): void {
  for (const handler of state.contentChangeHandlers) handler()
}

/**
 * AutoFill-only notify. Scoped deliberately: every other mutation family
 * calls the plain `notifyContentChangeHandlers` above and an observer
 * exception propagates exactly as it did before AutoFill existed. AutoFill
 * finalizes an already-decided outcome (a committed success ACK, a
 * rejection that also carries an independent dirty event, or an
 * outcome-unknown throw issued after a native call that may have already
 * committed) synchronously with this notify, so a throwing observer must
 * never replace that outcome with its own exception.
 */
export function notifyContentChangeHandlersForAutoFillOutcome(state: WorkerBackendState): void {
  for (const handler of state.contentChangeHandlers) {
    try {
      handler()
    } catch {
      // Advisory observer; see comment above.
    }
  }
}

export function beginSheetIndexRemap(state: WorkerBackendState): void {
  state.sheetIndexRemapDepth += 1
}

export function finishSheetIndexRemap(state: WorkerBackendState): void {
  state.sheetIndexRemapDepth = Math.max(0, state.sheetIndexRemapDepth - 1)
  if (state.sheetIndexRemapDepth > 0 || !state.deferredContentChange) return
  state.deferredContentChange = false
  notifyContentChangeHandlers(state)
}

export function dirtyCellsBelongToActiveAutoFill(
  state: WorkerBackendState,
  cells: readonly CellRefWire[],
): boolean {
  if (cells.length === 0 || state.autoFillNativeMutationRanges.length === 0) return false
  return state.autoFillNativeMutationRanges.some((range) =>
    cells.every((cell) => {
      if (cell.sheet !== range.sheet) return false
      const coord = parseA1(cell.addr)
      return (
        coord !== null &&
        coord.row >= range.startRow &&
        coord.row <= range.endRow &&
        coord.col >= range.startCol &&
        coord.col <= range.endCol
      )
    }),
  )
}

export async function runAutoFillNativeMutation<T>(
  state: WorkerBackendState,
  range: SparseRangeWire,
  mutation: () => Promise<T>,
): Promise<T> {
  state.autoFillNativeMutationRanges.push(range)
  try {
    return await mutation()
  } finally {
    const index = state.autoFillNativeMutationRanges.lastIndexOf(range)
    if (index >= 0) state.autoFillNativeMutationRanges.splice(index, 1)
  }
}

export function discardDeferredAutoFillContentChange(state: WorkerBackendState): void {
  state.deferredAutoFillContentChange = false
}

export function flushDeferredAutoFillContentChange(state: WorkerBackendState): void {
  if (state.autoFillNativeMutationRanges.length > 0 || !state.deferredAutoFillContentChange) return
  state.deferredAutoFillContentChange = false
  notifyContentChangeHandlersForAutoFillOutcome(state)
}

export function flushRejectedAutoFillContentChange(state: WorkerBackendState): void {
  if (state.autoFillNativeMutationRanges.length > 0 || !state.deferredAutoFillContentChange) return
  // A semantic rejection proves that the native auto-fill did not mutate.
  // Any deferred in-range dirty signal therefore belongs to an independent
  // mutation and needs its own epoch instead of being discarded.
  state.deferredAutoFillContentChange = false
  bumpRevision(state)
  if (state.sheetIndexRemapDepth > 0) {
    state.deferredContentChange = true
    return
  }
  notifyContentChangeHandlersForAutoFillOutcome(state)
}

/**
 * Subscribe to the worker's `cellsDirty` stream. Returns the unsubscribe
 * handle the backend stores on `state.offDirty` and calls from `dispose`.
 */
export function subscribeCellsDirty(state: WorkerBackendState): () => void {
  return state.client.onCellsDirty((cells) => {
    if (dirtyCellsBelongToActiveAutoFill(state, cells)) {
      state.deferredAutoFillContentChange = true
      return
    }
    // An event outside the active write range is an independent mutation.
    // Its refresh covers any earlier deferred in-range event as well.
    state.deferredAutoFillContentChange = false
    bumpRevision(state)
    if (state.sheetIndexRemapDepth > 0) {
      state.deferredContentChange = true
      return
    }
    notifyContentChangeHandlers(state)
  })
}
