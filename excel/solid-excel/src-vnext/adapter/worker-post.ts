/// <reference lib="WebWorker" />

import type { CellRefWire, CellSnapshotWire, RpcErrorWire, RpcResponseWire } from './worker-protocol'

/**
 * worker 与宿主之间那一个消息通道的端点。入站监听（`worker-runtime-core`）与
 * 下面的出站投递共用同一个句柄，别再各取一次 `self`。
 */
export const workerScope = self as unknown as DedicatedWorkerGlobalScope

export function postResponse(id: number, result: unknown) {
  const msg: RpcResponseWire = { id, ok: true, result }
  workerScope.postMessage(msg)
}

export function postError(id: number, error: RpcErrorWire) {
  const msg: RpcResponseWire = { id, ok: false, error }
  workerScope.postMessage(msg)
}

export function postDirty(cells: CellRefWire[]) {
  workerScope.postMessage({
    event: 'cellsDirty',
    cells: cells.map((cell) => ({ ...cell, addr: cell.addr.toUpperCase() })),
  })
}

export function postHydrated(cells: CellSnapshotWire[], subId?: number) {
  workerScope.postMessage({ event: 'cellsHydrated', cells, subId })
}
