/**
 * `ParityEngine` 的 **TS 引擎**实现：驱动 `createWorkerRuntimeTs().handle()`
 * 的 RPC 面 —— 真 Worker 跑的就是这个 dispatcher，所以 parity 测到的是产线路径。
 *
 * bulk 路径：beginImport → importChunk → commitImport（runtime 内部每表一次
 * `bulkApply`）。
 */
import { expect } from '@jest/globals'

import {
  createWorkerRuntimeTs,
  type ExcelCoreTsWorkerRuntime,
} from '../src-vnext/adapter/worker-runtime-ts'
import { SHEET_NAMES } from './scale-parity-workload'
import {
  refKey,
  type ParityEngine,
  type PersistenceSnapshot,
  type SampledCell,
} from './scale-parity-engine-types'

/** Raw `handle()` envelope — needed by specs that assert a REJECTION shape. */
export type TsRpcEnvelope = Awaited<ReturnType<ExcelCoreTsWorkerRuntime['handle']>>

export function makeTsEngine(runtime?: ExcelCoreTsWorkerRuntime): ParityEngine & {
  rpc: (msg: Record<string, unknown>) => Promise<unknown>
  rawRpc: (msg: Record<string, unknown>) => Promise<TsRpcEnvelope>
} {
  const rt = runtime ?? createWorkerRuntimeTs()
  let rpcId = 0
  // `rawRpc` hands back the envelope verbatim; `rpc` is the happy-path
  // wrapper that unwraps `result` and throws on an error envelope. P3 needs
  // the raw form because the thing under assertion IS the error envelope.
  const rawRpc = async (msg: Record<string, unknown>) => {
    rpcId += 1
    return rt.handle({ id: rpcId, ...msg } as never)
  }
  const rpc = async (msg: Record<string, unknown>) => {
    const resp = await rawRpc(msg)
    if (!resp.ok) {
      throw new Error(`ts rpc ${String(msg.cmd)} failed: ${resp.error.code} ${resp.error.message}`)
    }
    return resp.result
  }

  return {
    label: 'ts',
    rpc,
    rawRpc,
    async importWorkload(cells) {
      await rpc({ cmd: 'initWorkbook', sheets: SHEET_NAMES })
      const sessionId = (await rpc({ cmd: 'beginImport', mode: 'atomic' })) as number
      // Stream in chunks like the real backend does; the runtime buffers
      // and commits in one bulkApply per sheet either way.
      const CHUNK = 25_000
      for (let i = 0; i < cells.length; i += CHUNK) {
        await rpc({ cmd: 'importChunk', sessionId, cells: cells.slice(i, i + CHUNK) })
      }
      const stats = (await rpc({ cmd: 'commitImport', sessionId })) as {
        accepted: number
        formulas: number
        rejectedFormulas: number
      }
      // Counter, not clock: every staged cell must be accepted.
      expect(stats.accepted).toBe(cells.length)
      expect(stats.rejectedFormulas).toBe(0)
    },
    async readSamples(refs) {
      const out = new Map<string, SampledCell>()
      const snaps = (await rpc({
        cmd: 'readCells',
        cells: refs.map((r) => ({ sheet: r.sheet, addr: r.addr })),
      })) as Array<{ sheet: number; addr: string; display: string; isError: boolean }>
      snaps.forEach((snap, i) => {
        out.set(refKey(refs[i]), { display: snap.display, isError: snap.isError })
      })
      return out
    },
    async applyEdit(op) {
      switch (op.op) {
        case 'setNumber':
          await rpc({
            cmd: 'setCell',
            sheet: op.sheet,
            addr: op.addr,
            value: { type: 'number', value: op.value },
          })
          return
        case 'setText':
          await rpc({
            cmd: 'setCell',
            sheet: op.sheet,
            addr: op.addr,
            value: { type: 'text', value: op.value },
          })
          return
        case 'clearCell':
          await rpc({ cmd: 'clearCell', sheet: op.sheet, addr: op.addr })
          return
        case 'setFormula':
          await rpc({ cmd: 'setFormula', sheet: op.sheet, addr: op.addr, formula: op.formula })
          return
      }
    },
    async clearColumn(sheet, col) {
      return (await rpc({
        cmd: 'clearRange',
        range: { sheet, startRow: 0, startCol: col, endRow: 1_048_575, endCol: col },
      })) as number
    },
    async cacheState(sheet, addr) {
      return (await rpc({ cmd: 'debugFormulaCacheState', sheet, addr })) as string
    },
    async snapshotPersistence() {
      return (await rpc({ cmd: 'snapshotPersistenceV1' })) as PersistenceSnapshot
    },
    async restoreIntoFresh(snapshot) {
      const fresh = makeTsEngine()
      await fresh.rpc({ cmd: 'restorePersistenceV1', snapshot })
      return fresh
    },
    dispose() {
      // GC'd with the closure.
    },
  }
}

