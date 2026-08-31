import type { SparseCellWire, WorkbookPersistenceSnapshotWire } from '../worker-protocol'
import { normalizeSparseRange } from '../worker-wire-guards'
import { beginSnapshot, cancelSnapshot, exportRangeTsv, nextSnapshotChunk } from './export-session'
import {
  appendImportChunk,
  beginImport,
  cancelImport,
  commitImport,
  importCells,
  sparseCellsToImport,
} from './import-session'
import { restorePersistence, snapshotPersistence } from './persistence'
import { handled, unhandled, type RuntimeCommandHandler } from './runtime-dispatch'

export const handleTransferCommands: RuntimeCommandHandler = (msg, { state, persistence }) => {
  switch (msg.cmd) {
    case 'beginImport':
      return handled(beginImport(state, msg.sessionId, msg.mode))
    case 'importChunk':
      return handled(appendImportChunk(state, msg.sessionId, msg.cells))
    case 'commitImport':
      return handled(commitImport(state, msg.sessionId))
    case 'cancelImport':
      return handled(cancelImport(state, msg.sessionId))
    case 'restoreSparse': {
      const cells = Array.isArray(msg.cells) ? (msg.cells as SparseCellWire[]) : []
      const importable = sparseCellsToImport(cells)
      importCells(state, importable)
      return handled(importable.length)
    }
    case 'exportRangeTsv':
      return handled(exportRangeTsv(state, normalizeSparseRange(msg.range)))
    case 'cancelExport':
      return handled(false)
    case 'cancelSnapshot':
      return handled(cancelSnapshot(state, msg.sessionId))
    case 'beginSnapshotRangeSparse':
      return handled(beginSnapshot(state, normalizeSparseRange(msg.range), msg.rowsPerChunk))
    case 'nextSnapshotRangeSparseChunk':
      return handled(nextSnapshotChunk(state, msg.sessionId))
    case 'snapshotPersistenceV1':
      return handled(snapshotPersistence(state, persistence))
    case 'restorePersistenceV1':
      return handled(
        restorePersistence(
          state,
          msg.snapshot as WorkbookPersistenceSnapshotWire | undefined,
          persistence,
        ),
      )
    default:
      return unhandled()
  }
}
