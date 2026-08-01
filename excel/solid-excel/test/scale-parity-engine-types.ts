/**
 * scale-parity 的**引擎契约**：`ParityEngine` —— 每条 phase 规格只写一遍，
 * 对两个引擎各跑一次。两份实现在 `scale-parity-engine-ts.ts` 与
 * `scale-parity-engine-wasm.ts`。
 *
 * 这里只放形状，不放任何一个引擎的细节 —— 一旦某个方法只有一边实现得了，
 * 那就是一条该被记下来的分歧，不是该在契约里开的洞。
 */
import type { CellRef, WorkloadCell } from './scale-parity-workload'
import type { EditOp } from './scale-parity-edits'

// ---------------------------------------------------------------------------
// Engine drivers — one common surface over both runtimes.
// ---------------------------------------------------------------------------
export interface SampledCell {
  display: string
  isError: boolean
}

export interface ParityEngine {
  readonly label: 'ts' | 'wasm'
  importWorkload(cells: WorkloadCell[]): Promise<void>
  readSamples(refs: CellRef[]): Promise<Map<string, SampledCell>>
  applyEdit(op: EditOp): Promise<void>
  /** Clear one full column (rows 0..1_048_575). Returns the cleared-cell counter. */
  clearColumn(sheet: number, col: number): Promise<number>
  cacheState(sheet: number, addr: string): Promise<string>
  snapshotPersistence(): Promise<PersistenceSnapshot>
  /** Build a FRESH engine of the same kind and restore the snapshot into it. */
  restoreIntoFresh(snapshot: PersistenceSnapshot): Promise<ParityEngine>
  dispose(): void
}

export interface PersistenceSnapshot {
  version: number
  /**
   * `WorkbookPersistenceSheetWire`
   * (`excel/solid-excel/src-vnext/adapter/worker-protocol.ts`) —
   * `{ idx, name }` 是**全部**字段，没有可选项。这就是 P5 能对 sheets 做
   * 全等比对的原因：形状里没有留给「某一边填、另一边不填」的空位。
   */
  sheets: Array<{ idx: number; name: string }>
  cells: Array<{
    sheet: number
    addr: string
    row: number
    col: number
    kind: string
    value?: unknown
  }>
  [key: string]: unknown
}

export function refKey(ref: CellRef): string {
  return `${ref.sheet}:${ref.addr}`
}

