/** Shared deterministic helpers for editing transaction tests. */
import type { Store } from '@einfach/core'

import { startEditingAtom } from '../src/editing'

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
  store.setter(startEditingAtom, {
    sheetId: 'sheet-1',
    cell: { row: 4, col: 2 },
    draft,
    source: 'cell',
  })
}
