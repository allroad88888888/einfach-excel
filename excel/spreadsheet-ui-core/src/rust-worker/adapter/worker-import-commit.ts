import type { SheetBulkInstallWire } from './wasm-workbook-surface'
import {
  importCellIssue,
  importCellKey,
  type AtomicImportSession,
  type DirectImportSession,
} from './worker-import-normalize'
import { emptyImportStats } from './worker-import-stats'
import { assertMethod, normalizeSparseCell } from './worker-wire-guards'
import type { ImportCellIssueWire, ImportCellWire, SparseCellWire, WorkbookImportStatsWire } from './worker-protocol'

/**
 * 把导入的单元格真正写进工作簿：direct 会话逐块加性写入活工作簿，atomic 会话
 * 先在壳里暂存、提交时一次装入再重放到活工作簿。
 */

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function directImportPartialFailure(err: unknown) {
  const reason = errorMessage(err)
  const prefix = 'direct import failed; import is non-atomic and may contain partial writes'
  return Object.assign(
    new Error(`${prefix}: ${reason}`),
    { code: 'DIRECT_IMPORT_PARTIAL_FAILURE' },
  )
}

// TODO(6.4): direct sessions write ADDITIVELY into the live workbook —
// the storage-primary `bulk_install_workbook` is a full-sheet replace,
// so this path stays on the legacy `bulk_import_cells` until the engine
// grows an additive storage-primary entry.
export function importCellsIntoDirectSession(
  session: DirectImportSession,
  cells: ImportCellWire[],
): WorkbookImportStatsWire {
  const bulkImportCells = assertMethod(session.workbook, 'bulk_import_cells')
  try {
    return bulkImportCells.call(session.workbook, cells)
  } catch (err) {
    throw directImportPartialFailure(err)
  }
}

/**
 * STORAGE_PRIMARY Phase 6.3 — chunk-time stats for atomic sessions.
 *
 * Atomic chunks no longer touch the shell engine per chunk (the staged
 * cells install in ONE `bulk_install_workbook` call at commit), so the
 * per-chunk stats the legacy shell `bulk_import_cells` used to return
 * are synthesized here with the same counting rules:
 *
 * - sheet out of range  → `errors` + a `SHEET_OUT_OF_RANGE` issue
 *   (mirrors the engine's per-cell check; the cells stay recorded in
 *   `finalTouches` and are skipped again at install/snapshot, exactly
 *   like the legacy flow).
 * - `null`              → `accepted` + `cleared`.
 * - `formula`           → `formulas` + optimistic `accepted`. The
 *   storage-primary install parks formula text without parsing;
 *   rejections surface when commit replays the staged cells onto the
 *   live workbook through the legacy `bulk_import_cells`, and
 *   `mergeFinalCommitStats` reconciles `accepted` / `rejectedFormulas`
 *   from that replay — same net stats as the legacy chunk-time
 *   rejection.
 * - everything else     → `accepted` (values are already validated by
 *   `normalizeImportCells`).
 */
export function stageAtomicChunkStats(
  session: AtomicImportSession,
  cells: ImportCellWire[],
): WorkbookImportStatsWire {
  const stats = emptyImportStats()
  const sheetCount = session.workbook.sheet_count()
  const issues: ImportCellIssueWire[] = []
  for (const cell of cells) {
    if (cell.sheet >= sheetCount) {
      stats.errors += 1
      issues.push(
        importCellIssue(cell, 'SHEET_OUT_OF_RANGE', 'cell sheet index is outside the workbook'),
      )
      continue
    }
    if (cell.kind === 'null') {
      stats.accepted += 1
      stats.cleared += 1
      continue
    }
    if (cell.kind === 'formula') stats.formulas += 1
    stats.accepted += 1
  }
  return issues.length > 0 ? { ...stats, issues } : stats
}

export function recordFinalTouches(session: AtomicImportSession, cells: ImportCellWire[]) {
  for (const cell of cells) session.finalTouches.set(importCellKey(cell), cell)
}

/**
 * Group staged import cells into the per-sheet `bulk_install_workbook`
 * payload. Mirrors `snapshotFinalImportTouches` / `finalImportClears`
 * filtering: out-of-range sheets are skipped (the binding rejects the
 * whole payload otherwise), and `null` kinds are skipped because the
 * shell starts empty — there is nothing to clear there; the clears
 * still replay onto the live workbook via `finalImportClears`.
 */
function buildBulkInstallPayload(
  cells: Iterable<ImportCellWire>,
  sheetCount: number,
): SheetBulkInstallWire[] {
  const bySheet = new Map<number, SheetBulkInstallWire>()
  for (const cell of cells) {
    if (cell.sheet >= sheetCount) continue
    if (cell.kind === 'null') continue
    let entry = bySheet.get(cell.sheet)
    if (!entry) {
      entry = { sheet: cell.sheet, primitives: [], formulas: [] }
      bySheet.set(cell.sheet, entry)
    }
    const addr = `${cell.row}:${cell.col}`
    if (cell.kind === 'formula') entry.formulas.push([addr, cell.value])
    else if (cell.kind === 'error') entry.primitives.push([addr, { error: cell.value }])
    else entry.primitives.push([addr, cell.value])
  }
  return [...bySheet.values()]
}

/**
 * STORAGE_PRIMARY Phase 6.3 — install the atomic session's staged cells
 * into its shell workbook in one storage-primary call.
 *
 * The shell is a FRESH workbook created at `beginImport`
 * (`createWorkbookShell`), so the engine's full-sheet-replace semantics
 * equal a plain fresh install here: one map swap per sheet instead of
 * per-cell loader calls. `finalTouches` is already deduped
 * last-write-wins, so the single install lands the same end state the
 * legacy per-chunk `bulk_import_cells` sequence produced.
 *
 * Falls back to the legacy path when the binding is unavailable (test
 * mocks, pre-Phase-6.2 wasm-pkg builds).
 */
export function installAtomicStagingIntoShell(session: AtomicImportSession) {
  if (session.finalTouches.size === 0) return
  const shell = session.workbook
  const bulkInstallWorkbook = shell.bulk_install_workbook
  if (typeof bulkInstallWorkbook === 'function') {
    const payload = buildBulkInstallPayload(session.finalTouches.values(), shell.sheet_count())
    if (payload.length > 0) bulkInstallWorkbook.call(shell, payload)
    return
  }
  assertMethod(shell, 'bulk_import_cells').call(shell, [...session.finalTouches.values()])
}

export function snapshotFinalImportTouches(session: AtomicImportSession): SparseCellWire[] {
  const snapshotRangeSparse = assertMethod(session.workbook, 'snapshot_range_sparse')
  const out: SparseCellWire[] = []
  for (const cell of session.finalTouches.values()) {
    if (cell.kind === 'null') continue
    if (cell.sheet >= session.workbook.sheet_count()) continue
    out.push(
      ...snapshotRangeSparse
        .call(session.workbook, cell.sheet, cell.row, cell.col, cell.row, cell.col)
        .map(normalizeSparseCell),
    )
  }
  return out
}

export function finalImportClears(session: AtomicImportSession): ImportCellWire[] {
  return [...session.finalTouches.values()].filter(
    (cell) => cell.kind === 'null' && cell.sheet < session.workbook.sheet_count(),
  )
}

export function sparseCellToImportCell(cell: SparseCellWire): ImportCellWire {
  switch (cell.kind) {
    case 'number':
      return { sheet: cell.sheet, row: cell.row, col: cell.col, kind: 'number', value: cell.value }
    case 'text':
      return { sheet: cell.sheet, row: cell.row, col: cell.col, kind: 'text', value: cell.value }
    case 'boolean':
      return {
        sheet: cell.sheet,
        row: cell.row,
        col: cell.col,
        kind: 'boolean',
        value: cell.value,
      }
    case 'error':
      return { sheet: cell.sheet, row: cell.row, col: cell.col, kind: 'error', value: cell.value }
    case 'formula':
      return { sheet: cell.sheet, row: cell.row, col: cell.col, kind: 'formula', value: cell.value }
  }
}
