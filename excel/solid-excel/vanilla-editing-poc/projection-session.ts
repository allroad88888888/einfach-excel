// 一句话：管理 UI Core 可见投影请求、传输和投影读回。

import type { Store } from '@einfach/core'
import {
  beginProjectionAtom,
  projectionSnapshotAtom,
  rejectProjectionAtom,
  resolveProjectionAtom,
  type CellCoord,
  type CellRange,
  type DisplayCell,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'

import type { VanillaEditingProjectionSession } from './types'

interface VanillaEditingProjectionSessionOptions {
  readonly backend: SpreadsheetBackend
  readonly sheetId: string
  readonly store: Store
  readonly window: CellRange
}

function readVisibleCell(store: Store, sheetId: string, cell: CellCoord): DisplayCell | null {
  const result = store.getter(projectionSnapshotAtom).result
  if (result?.kind !== 'visible-window' || result.sheetId !== sheetId) return null
  return (
    result.cells.find((candidate) => candidate.row === cell.row && candidate.col === cell.col) ??
    null
  )
}

async function runVisibleProjectionTransport(
  store: Store,
  backend: SpreadsheetBackend,
  initialRequest: VisibleProjectionRequest,
): Promise<void> {
  let request = initialRequest

  while (true) {
    try {
      const result = await backend.readVisibleProjection(request)
      const outcome = store.setter(resolveProjectionAtom, { request, result })
      if (!outcome.nextRequest) return
      request = outcome.nextRequest
    } catch (error) {
      const outcome = store.setter(rejectProjectionAtom, { request, error })
      if (outcome.status !== 'rejected' || !outcome.nextRequest) throw error
      request = outcome.nextRequest
    }
  }
}

export function createVanillaEditingProjectionSession(
  options: VanillaEditingProjectionSessionOptions,
): VanillaEditingProjectionSession {
  let activeTransport: Promise<void> | null = null

  async function request(reason: 'viewport' | 'formula-bar'): Promise<void> {
    const begin = options.store.setter(beginProjectionAtom, {
      kind: 'visible-window',
      sheetId: options.sheetId,
      window: options.window,
      reason,
      retainResult: true,
    })
    if (begin.status === 'queued') return activeTransport ?? Promise.resolve()
    if (begin.status !== 'started' || begin.request.kind !== 'visible-window') return

    const transport = runVisibleProjectionTransport(options.store, options.backend, begin.request)
    activeTransport = transport
    try {
      await transport
    } finally {
      if (activeTransport === transport) activeTransport = null
    }
  }

  return Object.freeze({
    load: () => request('viewport'),
    readCell: (cell: CellCoord) => readVisibleCell(options.store, options.sheetId, cell),
    refresh: async (sheetId: string) => {
      if (sheetId !== options.sheetId) return
      await request('formula-bar')
    },
  })
}
