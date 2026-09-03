import type {
  CellRefWire,
  CellSnapshotWire,
  RpcErrorWire,
  WorkerWorkbookOptions,
} from './cell-range'
import type { RpcEventWire, RpcResponseWire, WorkerWorkbookClient } from './client-contract'
import type { WorkerRpcRequest } from './client-request'
import { createDataCommands, normalizeRef } from './client-data-commands'
import { createTableFilterCommands } from './client-table-commands'
import { createWorkbookCommands } from './client-workbook-commands'

type PendingRequest = { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
type Subscriber = { keys: Set<string>; callback: (cells: CellRefWire[]) => void }

function cellKey(ref: CellRefWire): string { return `${ref.sheet}:${ref.addr.toUpperCase()}` }
function toError(error: RpcErrorWire): Error {
  return Object.assign(new Error(error.message), {
    code: error.code,
    ...(error.detail === undefined ? {} : { detail: error.detail }),
  })
}

export function createWorkerWorkbook(opts: WorkerWorkbookOptions): WorkerWorkbookClient {
  const worker = opts.workerFactory()
  let nextId = 1
  let nextSubId = 1
  let disposed = false
  let workerFailure: Error | null = null
  const pending = new Map<number, PendingRequest>()
  const subscribers = new Map<number, Subscriber>()
  const dirtyListeners = new Set<(cells: CellRefWire[]) => void>()
  const hydratedListeners = new Set<(cells: CellSnapshotWire[]) => void>()

  function failWorker(detail: string): void {
    if (workerFailure) return
    workerFailure = new Error(
      `spreadsheet worker failed to start or crashed (${detail}). ` +
        'If this is a deployed app, verify einfach_wasm_bg.wasm is published and reachable ' +
        '(Network tab: HTTP 200), and that CSP allows worker-src and WebAssembly. ' +
        'See the @einfach/solid-excel README on worker backends.',
    )
    for (const entry of pending.values()) entry.reject(workerFailure)
    pending.clear()
  }

  const request: WorkerRpcRequest = <T>(cmd: string, payload: Record<string, unknown> = {}) => {
    if (disposed) return Promise.reject(new Error('worker workbook disposed'))
    if (workerFailure) return Promise.reject(workerFailure)
    const id = nextId++
    worker.postMessage({ id, cmd, ...payload })
    return new Promise<T>((resolve, reject) => pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    }))
  }

  function handleResponse(msg: RpcResponseWire): void {
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    if (msg.ok) entry.resolve(msg.result)
    else entry.reject(toError(msg.error))
  }
  function handleDirty(cells: CellRefWire[]): void {
    const normalized = cells.map(normalizeRef)
    for (const listener of dirtyListeners) listener(normalized)
    for (const sub of subscribers.values()) {
      const matches = normalized.filter((cell) => sub.keys.has(cellKey(cell)))
      if (matches.length > 0) sub.callback(matches)
    }
  }
  function handleHydrated(cells: CellSnapshotWire[]): void {
    const normalized = cells.map((cell) => ({ ...cell, addr: cell.addr.toUpperCase() }))
    for (const listener of hydratedListeners) listener(normalized)
  }

  const onWorkerMessage = (event: MessageEvent) => {
    const msg = (event.data ?? {}) as Partial<RpcResponseWire & RpcEventWire>
    if (typeof msg.id === 'number' && typeof msg.ok === 'boolean') {
      return handleResponse(msg as RpcResponseWire)
    }
    if (msg.event === 'cellsDirty') return handleDirty(Array.isArray(msg.cells) ? msg.cells : [])
    if (msg.event === 'cellsHydrated') {
      handleHydrated(Array.isArray(msg.cells) ? msg.cells as CellSnapshotWire[] : [])
    }
  }
  worker.addEventListener('message', onWorkerMessage)

  const onWorkerFailure = (event: Event) => {
    const type = (event as { type?: string } | null)?.type
    if (type !== 'error' && type !== 'messageerror') return
    if (type === 'messageerror') return failWorker('messageerror: worker reply could not be deserialized')
    const err = event as ErrorEvent
    failWorker([err.message, err.filename].filter(Boolean).join(' @ ') || 'error event')
  }
  const workerEvents = worker as unknown as {
    addEventListener?: (type: string, listener: (event: Event) => void) => void
    removeEventListener?: (type: string, listener: (event: Event) => void) => void
  }
  workerEvents.addEventListener?.('error', onWorkerFailure)
  workerEvents.addEventListener?.('messageerror', onWorkerFailure)

  const client: WorkerWorkbookClient = {
    ...createWorkbookCommands(request),
    ...createTableFilterCommands(request),
    ...createDataCommands(request),
    async subscribeCells(cells, callback) {
      const subId = nextSubId++
      const normalized = cells.map(normalizeRef)
      subscribers.set(subId, { keys: new Set(normalized.map(cellKey)), callback })
      try {
        await request<boolean>('subscribeCells', { subId, cells: normalized })
        return subId
      } catch (err) {
        subscribers.delete(subId)
        throw err
      }
    },
    async unsubscribeCells(subId) {
      subscribers.delete(subId)
      return request<boolean>('unsubscribeCells', { subId })
    },
    onCellsDirty(callback) {
      dirtyListeners.add(callback)
      return () => dirtyListeners.delete(callback)
    },
    onCellsHydrated(callback) {
      hydratedListeners.add(callback)
      return () => hydratedListeners.delete(callback)
    },
    dispose() {
      if (disposed) return
      disposed = true
      worker.removeEventListener('message', onWorkerMessage)
      workerEvents.removeEventListener?.('error', onWorkerFailure)
      workerEvents.removeEventListener?.('messageerror', onWorkerFailure)
      for (const entry of pending.values()) entry.reject(new Error('worker workbook disposed'))
      pending.clear()
      subscribers.clear()
      dirtyListeners.clear()
      hydratedListeners.clear()
      worker.terminate()
    },
  }
  return client
}
