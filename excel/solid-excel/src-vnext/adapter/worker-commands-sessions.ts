import type { WorkerCommandHandler } from './worker-command'
import {
  finalImportClears,
  importCellsIntoDirectSession,
  installAtomicStagingIntoShell,
  recordFinalTouches,
  snapshotFinalImportTouches,
  sparseCellToImportCell,
  stageAtomicChunkStats,
} from './worker-import-commit'
import {
  ensureImportChunkSize,
  ensureImportSessionLimits,
  normalizeImportCells,
  normalizeImportSessionMode,
} from './worker-import-normalize'
import {
  emptyImportStats,
  mergeFinalCommitStats,
  mergeImportStats,
  mergeImportStatsIssues,
} from './worker-import-stats'
import { postResponse } from './worker-post'
import {
  clampRowsPerChunk,
  exportRangeTsvChunk,
  rangeTotalRows,
  snapshotRangeSparseChunk,
} from './worker-range-stream'
import {
  allocateExportSessionId,
  allocateSnapshotSessionId,
  assertExportSessionId,
  assertImportSessionId,
  assertSnapshotSessionId,
  exportSessions,
  importSessions,
  snapshotSessions,
} from './worker-session-registry'
import { assertMethod, assertSheet, normalizeSparseRange } from './worker-wire-guards'
import { createWorkbookShell } from './worker-workbook-host'
import type { ImportCellWire } from './worker-protocol'

/** 分块会话的 begin / next / commit / cancel：导入、TSV 导出、稀疏快照。 */

export const handleSessionCommand: WorkerCommandHandler = (id, msg, wb) => {
  switch (msg.cmd) {
    case 'beginImport': {
      const sessionId = Number(msg.sessionId)
      assertImportSessionId(sessionId)
      if (importSessions.has(sessionId)) {
        throw Object.assign(new Error(`import session already exists: ${sessionId}`), {
          code: 'IMPORT_SESSION_EXISTS',
        })
      }
      const mode = normalizeImportSessionMode(msg.mode, msg.atomic)
      const baseSession = {
        normalizedCount: 0,
        stats: emptyImportStats(),
        normalizationIssues: [],
      }
      importSessions.set(
        sessionId,
        mode === 'direct'
          ? {
              ...baseSession,
              mode,
              workbook: wb,
            }
          : {
              ...baseSession,
              mode,
              workbook: createWorkbookShell(wb),
              finalTouches: new Map(),
            },
      )
      postResponse(id, sessionId)
      return true
    }
    case 'importChunk': {
      const sessionId = Number(msg.sessionId)
      assertImportSessionId(sessionId)
      const session = importSessions.get(sessionId)
      if (!session) {
        throw Object.assign(new Error(`missing import session: ${sessionId}`), {
          code: 'IMPORT_SESSION_MISSING',
        })
      }
      const rawCells = Array.isArray(msg.cells) ? msg.cells : []
      ensureImportChunkSize(rawCells)
      const chunk = normalizeImportCells(rawCells as ImportCellWire[])
      ensureImportSessionLimits(session, chunk)
      if (chunk.cells.length > 0) {
        // STORAGE_PRIMARY Phase 6.3: atomic chunks only stage —
        // the shell install happens once at commit through
        // `bulk_install_workbook`. Direct chunks keep writing
        // additively into the live workbook via the legacy path.
        const stats =
          session.mode === 'atomic'
            ? stageAtomicChunkStats(session, chunk.cells)
            : importCellsIntoDirectSession(session, chunk.cells)
        session.stats = mergeImportStats(session.stats, stats)
        if (session.mode === 'atomic') recordFinalTouches(session, chunk.cells)
        session.normalizedCount += chunk.cells.length
      }
      session.normalizationIssues.push(...chunk.issues)
      postResponse(id, session.normalizedCount)
      return true
    }
    case 'commitImport': {
      const sessionId = Number(msg.sessionId)
      assertImportSessionId(sessionId)
      const session = importSessions.get(sessionId)
      if (!session) {
        throw Object.assign(new Error(`missing import session: ${sessionId}`), {
          code: 'IMPORT_SESSION_MISSING',
        })
      }
      if (session.mode === 'direct') {
        importSessions.delete(sessionId)
        postResponse(id, mergeImportStatsIssues(session.stats, session.normalizationIssues))
        return true
      }
      // STORAGE_PRIMARY Phase 6.3: the staged cells land in the
      // fresh shell in ONE storage-primary install, then the
      // snapshot below reads the final cell states back (lazy
      // formulas serialize their source without evaluating).
      installAtomicStagingIntoShell(session)
      const changedCells = snapshotFinalImportTouches(session)
      const finalClears = finalImportClears(session)
      const finalWrites = [...changedCells.map(sparseCellToImportCell), ...finalClears]
      let stats = session.stats
      if (finalWrites.length > 0) {
        // TODO(6.4): the replay onto the LIVE workbook is additive
        // (it may hold content outside the imported range), so it
        // stays on the legacy `bulk_import_cells` — full-sheet
        // replace would tear down unrelated cells.
        const finalStats = assertMethod(wb, 'bulk_import_cells').call(wb, finalWrites)
        stats = mergeFinalCommitStats(stats, finalStats)
      }

      importSessions.delete(sessionId)
      postResponse(id, mergeImportStatsIssues(stats, session.normalizationIssues))
      return true
    }
    case 'cancelImport': {
      const sessionId = Number(msg.sessionId)
      assertImportSessionId(sessionId)
      postResponse(id, importSessions.delete(sessionId))
      return true
    }
    case 'beginExportRangeTsv': {
      const range = normalizeSparseRange(msg.range)
      assertSheet(wb, range.sheet)
      const rowsPerChunk = clampRowsPerChunk(msg.rowsPerChunk)
      const sessionId = allocateExportSessionId()
      exportSessions.set(sessionId, {
        range,
        rowsPerChunk,
        totalRows: rangeTotalRows(range),
        nextRow: range.startRow,
      })
      postResponse(id, { sessionId, totalRows: rangeTotalRows(range), rowsPerChunk })
      return true
    }
    case 'nextExportRangeTsvChunk': {
      const sessionId = Number(msg.sessionId)
      assertExportSessionId(sessionId)
      const session = exportSessions.get(sessionId)
      if (!session) {
        throw Object.assign(new Error(`missing export session: ${sessionId}`), {
          code: 'EXPORT_SESSION_MISSING',
        })
      }
      const chunk = exportRangeTsvChunk(wb, session)
      if (chunk.done) exportSessions.delete(sessionId)
      postResponse(id, { sessionId, ...chunk })
      return true
    }
    case 'cancelExport': {
      const sessionId = Number(msg.sessionId)
      assertExportSessionId(sessionId)
      postResponse(id, exportSessions.delete(sessionId))
      return true
    }
    case 'beginSnapshotRangeSparse': {
      const range = normalizeSparseRange(msg.range)
      assertSheet(wb, range.sheet)
      const rowsPerChunk = clampRowsPerChunk(msg.rowsPerChunk)
      const sessionId = allocateSnapshotSessionId()
      snapshotSessions.set(sessionId, {
        range,
        rowsPerChunk,
        totalRows: rangeTotalRows(range),
        nextRow: range.startRow,
      })
      postResponse(id, { sessionId, totalRows: rangeTotalRows(range), rowsPerChunk })
      return true
    }
    case 'nextSnapshotRangeSparseChunk': {
      const sessionId = Number(msg.sessionId)
      assertSnapshotSessionId(sessionId)
      const session = snapshotSessions.get(sessionId)
      if (!session) {
        throw Object.assign(new Error(`missing snapshot session: ${sessionId}`), {
          code: 'SNAPSHOT_SESSION_MISSING',
        })
      }
      const chunk = snapshotRangeSparseChunk(wb, session)
      if (chunk.done) snapshotSessions.delete(sessionId)
      postResponse(id, { sessionId, ...chunk })
      return true
    }
    case 'cancelSnapshot': {
      const sessionId = Number(msg.sessionId)
      assertSnapshotSessionId(sessionId)
      postResponse(id, snapshotSessions.delete(sessionId))
      return true
    }
    default:
      return false
  }
}
