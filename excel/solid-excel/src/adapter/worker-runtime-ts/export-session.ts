import { sparseRangeToTSV } from '../range-tsv'
import type { SparseRangeWire } from '../worker-protocol'
import { snapshotRangeSparse } from './range-projection'
import { rpcError } from './runtime-errors'
import { assertSheetIdx, type RuntimeState } from './runtime-state'

const DEFAULT_ROWS_PER_CHUNK = 2048
const MIN_ROWS_PER_CHUNK = 1
const MAX_ROWS_PER_CHUNK = 10_000

function clampRowsPerChunk(value: unknown): number {
  const normalized = Math.floor(Number(value))
  if (!Number.isFinite(normalized)) return DEFAULT_ROWS_PER_CHUNK
  if (normalized < MIN_ROWS_PER_CHUNK) return MIN_ROWS_PER_CHUNK
  if (normalized > MAX_ROWS_PER_CHUNK) return MAX_ROWS_PER_CHUNK
  return normalized
}

export function exportRangeTsv(state: RuntimeState, range: SparseRangeWire): string {
  assertSheetIdx(state, range.sheet)
  const cells = snapshotRangeSparse(state, range)
  return sparseRangeToTSV(
    cells.map((cell) => ({
      row: cell.row,
      col: cell.col,
      kind: cell.kind,
      value: cell.kind === 'formula' ? cell.value : (cell.value as string | number | boolean),
    })),
    range,
  )
}

export function cancelSnapshot(state: RuntimeState, sessionIdValue: unknown): boolean {
  return state.snapshotSessions.delete(Number(sessionIdValue))
}

export function beginSnapshot(
  state: RuntimeState,
  range: SparseRangeWire,
  rowsPerChunkValue: unknown,
) {
  assertSheetIdx(state, range.sheet)
  const rowsPerChunk = clampRowsPerChunk(rowsPerChunkValue)
  const totalRows = Math.max(0, range.endRow - range.startRow + 1)
  const sessionId = state.nextSnapshotSessionId++
  state.snapshotSessions.set(sessionId, {
    range,
    rowsPerChunk,
    totalRows,
    nextRow: range.startRow,
  })
  return { sessionId, totalRows, rowsPerChunk }
}

export function nextSnapshotChunk(state: RuntimeState, sessionIdValue: unknown) {
  const sessionId = Number(sessionIdValue)
  const session = state.snapshotSessions.get(sessionId)
  if (!session) {
    throw rpcError('SNAPSHOT_SESSION_MISSING', `missing snapshot session: ${sessionId}`)
  }
  const { range } = session
  if (session.totalRows === 0 || session.nextRow > range.endRow) {
    state.snapshotSessions.delete(sessionId)
    return {
      sessionId,
      startRow: range.startRow,
      endRow: range.startRow - 1,
      cells: [],
      done: true,
    }
  }
  const startRow = session.nextRow
  const endRow = Math.min(range.endRow, startRow + session.rowsPerChunk - 1)
  const cells = snapshotRangeSparse(state, { ...range, startRow, endRow })
  session.nextRow = endRow + 1
  const done = session.nextRow > range.endRow
  if (done) state.snapshotSessions.delete(sessionId)
  return { sessionId, startRow, endRow, cells, done }
}
