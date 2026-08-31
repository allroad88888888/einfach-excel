import type { BulkCellInput, BulkTypedCellInput, ErrorCode } from '@einfach/excel-core-ts'

import type { ImportCellWire, SparseCellWire, WorkbookImportStatsWire } from '../worker-protocol'
import { rpcError } from './runtime-errors'
import type { RuntimeState, SheetEntry } from './runtime-state'

const EMPTY_IMPORT_STATS: WorkbookImportStatsWire = {
  accepted: 0,
  formulas: 0,
  rejectedFormulas: 0,
  cleared: 0,
  errors: 0,
}

type ImportBatch = {
  sheet: SheetEntry
  inputs: (BulkCellInput | BulkTypedCellInput)[]
  clears: { row: number; col: number }[]
}

export function importCells(
  state: RuntimeState,
  cells: readonly ImportCellWire[],
): WorkbookImportStatsWire {
  const stats = { ...EMPTY_IMPORT_STATS }
  const batches = new Map<number, ImportBatch>()

  function batchFor(sheetIdx: number): ImportBatch | undefined {
    const sheet = state.sheets[sheetIdx]
    if (!sheet) return undefined
    let batch = batches.get(sheetIdx)
    if (!batch) {
      batch = { sheet, inputs: [], clears: [] }
      batches.set(sheetIdx, batch)
    }
    return batch
  }

  for (const cell of cells) {
    const batch = batchFor(cell.sheet)
    if (!batch) {
      stats.errors += 1
      continue
    }
    try {
      switch (cell.kind) {
        case 'number':
          batch.inputs.push({
            row: cell.row,
            col: cell.col,
            value: { kind: 'number', value: cell.value },
          })
          stats.accepted += 1
          break
        case 'text':
          batch.inputs.push({
            row: cell.row,
            col: cell.col,
            value: { kind: 'string', value: cell.value },
          })
          stats.accepted += 1
          break
        case 'boolean':
          batch.inputs.push({
            row: cell.row,
            col: cell.col,
            value: { kind: 'boolean', value: cell.value },
          })
          stats.accepted += 1
          break
        case 'error':
          batch.inputs.push({
            row: cell.row,
            col: cell.col,
            value: { kind: 'error', code: cell.value as ErrorCode },
          })
          stats.accepted += 1
          break
        case 'formula': {
          const input =
            typeof cell.value === 'string' && cell.value.startsWith('=')
              ? cell.value
              : `=${cell.value}`
          batch.inputs.push({ row: cell.row, col: cell.col, input })
          stats.accepted += 1
          stats.formulas += 1
          break
        }
        case 'null':
          batch.clears.push({ row: cell.row, col: cell.col })
          stats.cleared += 1
          break
      }
    } catch {
      stats.errors += 1
    }
  }

  for (const batch of batches.values()) {
    try {
      if (batch.inputs.length > 0) state.workbook.bulkApply(batch.sheet.id, batch.inputs)
      for (const cell of batch.clears) {
        state.workbook.clearCell(batch.sheet.id, cell.row, cell.col, 'all')
      }
    } catch {
      stats.errors += 1
    }
  }
  return stats
}

export function beginImport(
  state: RuntimeState,
  sessionIdValue: unknown,
  modeValue: unknown,
): number {
  const sessionId = Number.isFinite(Number(sessionIdValue))
    ? Number(sessionIdValue)
    : state.nextImportSessionId++
  const mode = modeValue === 'direct' ? 'direct' : 'atomic'
  state.importSessions.set(sessionId, { mode, cells: [] })
  return sessionId
}

export function appendImportChunk(
  state: RuntimeState,
  sessionIdValue: unknown,
  cellsValue: unknown,
): number {
  const sessionId = Number(sessionIdValue)
  const session = state.importSessions.get(sessionId)
  if (!session) throw rpcError('INVALID_IMPORT_SESSION', `unknown import session: ${sessionId}`)
  const cells = Array.isArray(cellsValue) ? (cellsValue as ImportCellWire[]) : []
  session.cells.push(...cells)
  return cells.length
}

export function commitImport(state: RuntimeState, sessionIdValue: unknown) {
  const sessionId = Number(sessionIdValue)
  const session = state.importSessions.get(sessionId)
  if (!session) throw rpcError('INVALID_IMPORT_SESSION', `unknown import session: ${sessionId}`)
  state.importSessions.delete(sessionId)
  const stats = importCells(state, session.cells)
  return session.mode === 'atomic' ? stats : { ...EMPTY_IMPORT_STATS }
}

export function cancelImport(state: RuntimeState, sessionIdValue: unknown): boolean {
  return state.importSessions.delete(Number(sessionIdValue))
}

export function sparseCellsToImport(cells: readonly SparseCellWire[]): ImportCellWire[] {
  return cells.map((cell) => ({ ...cell }))
}
