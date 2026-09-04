/** Shared deterministic helpers for editing transaction tests. */
import type { Store } from '@einfach/core'

import type { EditingCommitRequest } from '../src/editing'
import { startEditingAtom } from '../src/editing'
import type {
  BackendMutationResult,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../src/backend'
import { beginProjectionAtom, projectionSnapshotAtom, resolveProjectionAtom } from '../src/projection'
import { bindTestRustWorkbookConnection } from './support/rust-workbook-connection'

export const EDITING_PROJECTION = Object.freeze({
  sheetId: 'sheet-1',
  window: Object.freeze({ rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 }),
  reason: 'viewport' as const,
  retainResult: true,
})

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

export async function flushMicrotasks(turns = 4): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

export function startCellEdit(store: Store, draft = '=B2+2'): void {
  const current = store.getter(projectionSnapshotAtom).request
  if (current?.kind !== 'visible-window' || current.sheetId !== EDITING_PROJECTION.sheetId) {
    const begun = store.setter(beginProjectionAtom, {
      kind: 'visible-window',
      ...EDITING_PROJECTION,
    })
    if (begun.status !== 'started' || begun.request.kind !== 'visible-window') {
      throw new Error(`Could not seed editing projection: ${begun.status}`)
    }
    store.setter(resolveProjectionAtom, {
      request: begun.request,
      result: {
        kind: 'visible-window',
        sheetId: begun.request.sheetId,
        requestId: begun.request.requestId,
        window: begun.request.window,
        cells: [],
      },
    })
  }
  store.setter(startEditingAtom, {
    sheetId: 'sheet-1',
    cell: { row: 4, col: 2 },
    draft,
    source: 'cell',
  })
}

export function bindEditingMutation(
  store: Store,
  setCellInput: (request: EditingCommitRequest) => Promise<BackendMutationResult>,
  setCellProjection?: (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>,
): void {
  bindTestRustWorkbookConnection(store, { setCellInput, setCellProjection })
}
