import type { DisplayCell, ProjectionRequestId, ProjectionRevision } from '../backend/types'
import type { CellRange } from '../shared'
import { DEFAULT_REMOVE_DUPLICATES_TIMEOUT_MS } from './constants'
import type { RemoveDuplicatesLifecycleState, RemoveDuplicatesRange, RemoveDuplicatesScanResult } from './types'

/** A frozen Set remains mutable; this iterable facade does not expose add/delete. */
class ImmutableReadonlySet<Value> {
  private readonly items: readonly Value[]
  constructor(values: Iterable<Value>) { this.items = Object.freeze(Array.from(new Set(values))); Object.freeze(this) }
  get size(): number { return this.items.length }
  has(value: Value): boolean { return this.items.includes(value) }
  forEach(callback: (value: Value, valueAgain: Value, set: ReadonlySet<Value>) => void, thisArg?: unknown): void { for (const value of this.items) callback.call(thisArg, value, value, this as unknown as ReadonlySet<Value>) }
  entries(): IterableIterator<[Value, Value]> { return this.items.map((value): [Value, Value] => [value, value]).values() }
  keys(): IterableIterator<Value> { return this.items.values() }
  values(): IterableIterator<Value> { return this.items.values() }
  [Symbol.iterator](): IterableIterator<Value> { return this.items.values() }
}
Object.freeze(ImmutableReadonlySet.prototype)

export function immutableReadonlySet<Value>(values: Iterable<Value>): ReadonlySet<Value> { return new ImmutableReadonlySet(values) as unknown as ReadonlySet<Value> }
export const EMPTY_CELLS: readonly DisplayCell[] = Object.freeze([])
export const EMPTY_KEY_COLUMNS: ReadonlySet<number> = immutableReadonlySet([])
export function snapshotRuntimeValue<Value>(value: Value, seen = new WeakMap<object, unknown>()): Value {
  if (value === null || typeof value !== 'object') return value
  const object = value as unknown as object
  const cached = seen.get(object)
  if (cached !== undefined) return cached as Value
  if (Array.isArray(value)) { const clone: unknown[] = []; seen.set(object, clone); for (const item of value) clone.push(snapshotRuntimeValue(item, seen)); return Object.freeze(clone) as Value }
  const clone: Record<string, unknown> = {}; seen.set(object, clone)
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) clone[key] = snapshotRuntimeValue(item, seen)
  return Object.freeze(clone) as Value
}
export function snapshotCells(cells: readonly DisplayCell[]): readonly DisplayCell[] { return snapshotRuntimeValue(Array.from(cells)) }
export function snapshotRange(range: CellRange): Readonly<CellRange> { return Object.freeze({ rowStart: range.rowStart, rowEnd: range.rowEnd, colStart: range.colStart, colEnd: range.colEnd }) }
export function snapshotRemoveDuplicatesRange(range: RemoveDuplicatesRange): RemoveDuplicatesRange { return Object.freeze({ startRow: range.startRow, endRow: range.endRow, startCol: range.startCol, endCol: range.endCol }) }
export function toRemoveDuplicatesRange(range: CellRange): RemoveDuplicatesRange { return snapshotRemoveDuplicatesRange({ startRow: range.rowStart, endRow: range.rowEnd, startCol: range.colStart, endCol: range.colEnd }) }
export function sameRange(left: CellRange, right: CellRange): boolean { return left.rowStart === right.rowStart && left.rowEnd === right.rowEnd && left.colStart === right.colStart && left.colEnd === right.colEnd }
export function validRange(range: CellRange): boolean { return Number.isSafeInteger(range.rowStart) && Number.isSafeInteger(range.rowEnd) && Number.isSafeInteger(range.colStart) && Number.isSafeInteger(range.colEnd) && range.rowStart >= 0 && range.colStart >= 0 && range.rowStart <= range.rowEnd && range.colStart <= range.colEnd }
export function validRevision(revision: unknown): revision is ProjectionRevision { return (typeof revision === 'number' && Number.isFinite(revision)) || (typeof revision === 'string' && revision.length > 0) }
export function errorMessage(error: unknown): string { try { if (error instanceof Error && error.message.length > 0) return error.message } catch { return 'Unknown transport failure.' } try { return String(error) } catch { return 'Unknown transport failure.' } }
export async function withRemoveDuplicatesTimeout<Value>(operation: Promise<Value>, timeoutMs: number, label: string): Promise<Value> { let timeoutHandle: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([operation, new Promise<never>((_resolve, reject) => { timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs) })]) } finally { if (timeoutHandle !== undefined) clearTimeout(timeoutHandle) } }
export function normalizeRemoveDuplicatesTimeout(timeoutMs: unknown): number { return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_REMOVE_DUPLICATES_TIMEOUT_MS }
export function lifecycleFor(status: RemoveDuplicatesLifecycleState['status'], sessionId: number, sheetId: string | null, readRequestId: ProjectionRequestId | null = null, mutationRequestId: ProjectionRequestId | null = null): RemoveDuplicatesLifecycleState { return Object.freeze({ status, sessionId, readRequestId, mutationRequestId, sheetId }) }
export function snapshotScanResult(result: RemoveDuplicatesScanResult): RemoveDuplicatesScanResult { return Object.freeze({ ...result, duplicateRows: Object.freeze(Array.from(result.duplicateRows)), ignoredColumns: Object.freeze(Array.from(result.ignoredColumns)) }) }
export function allColumnsInRange(range: RemoveDuplicatesRange): ReadonlySet<number> { const columns: number[] = []; if (range.startCol <= range.endCol) for (let col = range.startCol; col <= range.endCol; col += 1) columns.push(col); return immutableReadonlySet(columns) }
function nextSafeMonotonicIdentity(sequence: number): number | null { if (!Number.isSafeInteger(sequence)) return null; if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1; return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null }
export function nextRemoveDuplicatesSessionId(sequence: number): number | null { return nextSafeMonotonicIdentity(sequence) }
export function nextRemoveDuplicatesReadRequestId(sequence: number): number | null { return nextSafeMonotonicIdentity(sequence) }
export function nextRemoveDuplicatesMutationRequestId(sequence: number): number | null { return nextSafeMonotonicIdentity(sequence) }
