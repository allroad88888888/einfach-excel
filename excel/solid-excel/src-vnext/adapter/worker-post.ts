/// <reference lib="WebWorker" />

import type {
  CellRefWire,
  CellSnapshotWire,
  RpcErrorWire,
  RpcResponseWire,
} from './worker-protocol'
import { createWorkerWireTelemetry } from './worker-wire-telemetry'

/**
 * worker 与宿主之间那一个消息通道的端点。入站监听（`worker-runtime-core`）与
 * 下面的出站投递共用同一个句柄，别再各取一次 `self`。
 */
export const workerScope = self as unknown as DedicatedWorkerGlobalScope
export const workerWireTelemetry = createWorkerWireTelemetry()

workerScope.addEventListener('message', (event) => {
  workerWireTelemetry.record('host-to-worker', event.data)
})

function postWorkerMessage(message: unknown) {
  workerWireTelemetry.record('worker-to-host', message)
  workerScope.postMessage(message)
}

export function postResponse(id: number, result: unknown) {
  const msg: RpcResponseWire = { id, ok: true, result }
  postWorkerMessage(msg)
}

export function postError(id: number, error: RpcErrorWire) {
  const msg: RpcResponseWire = { id, ok: false, error }
  postWorkerMessage(msg)
}

export function postDirty(cells: CellRefWire[]) {
  postWorkerMessage({
    event: 'cellsDirty',
    cells: cells.map((cell) => ({ ...cell, addr: cell.addr.toUpperCase() })),
  })
}

export function postHydrated(cells: CellSnapshotWire[], subId?: number) {
  postWorkerMessage({ event: 'cellsHydrated', cells, subId })
}
