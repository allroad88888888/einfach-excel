// 一句话：选择性粘贴在 worker 上的组合执行。

import type {
  PasteRangeRequest,
  PasteRangeResult,
  PasteSpecialKind,
} from '@einfach/spreadsheet-ui-core'
import {
  SUPPORTED_PASTE_SPECIAL_KINDS,
  getEffectiveFormat,
  keyFor,
  toA1,
} from '@einfach/spreadsheet-ui-core'
import {
  applyPasteArithmetic,
  isPasteSourceBlank,
  pasteRangeGeometry,
  pasteSourceCoord,
} from '../paste-range-plan'
import type {
  CellFormatJSON,
  CellFormatSnapshot,
  CellSnapshotWire,
  ImportCellWire,
} from '../worker-protocol'
import { createBackendError } from './backend-error'
import { runtimeSupports } from './capabilities'
import { toImportCellWire } from './cell-input-wire'
import { preprocessFormatSnapshot } from './format-overlay'
import { DEFAULT_IMPORT_CELLS_PER_CHUNK, assertImportStatsOk } from './import-chunking'
import { PASTE_RANGE_FORMATS_UNSUPPORTED } from './limits'
import { recordCellMutation } from './record-cell-mutation'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import { parseA1, toSparseRange } from './wire-range'
import type { WorkerBackendState } from './state'

/** Value-leg-only paste kinds offered when the runtime models no formats. */
const WORKER_PASTE_VALUE_KINDS: readonly PasteSpecialKind[] = Object.freeze(['values', 'transpose'])

/**
 * Parity #11 — Paste Special on the worker path, adapter composition
 * (no new engine primitive). Source values/formats are read over
 * existing RPCs, the shared pure helpers in `paste-range-plan.ts`
 * (the same module the static reference implementation runs) compute
 * the patch, then values land through ONE direct import session and
 * formats through a target-rectangle format-snapshot restore.
 */
export function workerPasteRangeSupportedKinds(
  state: WorkerBackendState,
): readonly PasteSpecialKind[] {
  // The format leg needs BOTH families: `formats` to persist writes
  // and `formatSnapshots` to read source effective formats and to
  // capture the undo images. The TS runtime declares both false, so
  // it only offers the value-leg kinds.
  return runtimeSupports(state, 'formats') && runtimeSupports(state, 'formatSnapshots')
    ? SUPPORTED_PASTE_SPECIAL_KINDS
    : WORKER_PASTE_VALUE_KINDS
}

export async function pasteRangeThroughWorker(
  state: WorkerBackendState,
  request: PasteRangeRequest,
): Promise<PasteRangeResult> {
  const targetSheet = await resolveSheet(state, request.sheetId)
  const sourceSheet = await resolveSheet(state, request.source.sheetId)
  const geometry = pasteRangeGeometry(request)

  if (geometry.writeFormats && !workerPasteRangeSupportedKinds(state).includes(request.pasteKind)) {
    throw createBackendError(
      PASTE_RANGE_FORMATS_UNSUPPORTED,
      `paste-range kind "${request.pasteKind}" carries a format leg, but the worker ` +
        'runtime declares no format support; the request was rejected before any write',
    )
  }

  return recordCellMutation(state, {
    // UI-core's confirm command records the paste as a 'cells.import'
    // history entry; the adapter record aligns positionally with it.
    kind: 'cells.import',
    sheet: targetSheet,
    range: geometry.affectedRange,
    captureValues: geometry.writeValues,
    captureFormats: geometry.writeFormats,
    execute: async () => {
      const src = request.source.range
      const tgt = request.target
      const sourceSparse = toSparseRange(sourceSheet.idx, src)
      const targetSparse = toSparseRange(targetSheet.idx, geometry.affectedRange)

      const [sourceSnapshots, targetSnapshots, sourceFormatSnapshot, targetFormatSnapshot] =
        await Promise.all([
          state.client.readSparseRange(sourceSparse),
          // Existing target inputs are only consulted by the
          // arithmetic ops; plain writes never read the target.
          geometry.writeValues && request.op !== 'none'
            ? state.client.readSparseRange(targetSparse)
            : Promise.resolve([] as CellSnapshotWire[]),
          geometry.writeFormats
            ? state.client.snapshotFormatRange(sourceSparse)
            : Promise.resolve(null),
          geometry.writeFormats
            ? state.client.snapshotFormatRange(targetSparse)
            : Promise.resolve(null),
        ])

      const sourceByKey = new Map<string, CellSnapshotWire>()
      for (const snapshot of sourceSnapshots) {
        const coord = parseA1(snapshot.addr)
        if (coord) sourceByKey.set(keyFor(coord.row, coord.col), snapshot)
      }
      const targetDisplayByKey = new Map<string, string>()
      for (const snapshot of targetSnapshots) {
        const coord = parseA1(snapshot.addr)
        if (coord) targetDisplayByKey.set(keyFor(coord.row, coord.col), snapshot.display)
      }
      const sourceFormats = sourceFormatSnapshot
        ? preprocessFormatSnapshot(sourceFormatSnapshot)
        : null
      const existingTargetFormats = new Map<string, CellFormatSnapshot>()
      if (targetFormatSnapshot) {
        for (const entry of targetFormatSnapshot.cellFormats) {
          const coord = parseA1(entry.addr)
          if (coord) existingTargetFormats.set(keyFor(coord.row, coord.col), entry)
        }
      }

      const wires: ImportCellWire[] = []
      const targetCellFormats: CellFormatSnapshot[] = []
      for (let dr = 0; dr < geometry.patchRows; dr += 1) {
        for (let dc = 0; dc < geometry.patchCols; dc += 1) {
          const srcCoord = pasteSourceCoord(src, geometry.transpose, dr, dc)
          const tgtRow = tgt.rowStart + dr
          const tgtCol = tgt.colStart + dc
          const srcSnapshot = sourceByKey.get(keyFor(srcCoord.row, srcCoord.col))
          const srcDisplay = srcSnapshot?.display ?? ''
          const srcFormula =
            srcSnapshot && srcSnapshot.formula !== '' ? srcSnapshot.formula : undefined

          if (request.skipBlanks && isPasteSourceBlank(srcDisplay, srcFormula)) {
            // The format restore below REPLACES per-cell formats in
            // the whole target rectangle, so skipped cells must carry
            // their CURRENT per-cell format through it (static parity:
            // skip-blanks leaves both legs of the target untouched).
            const existing = existingTargetFormats.get(keyFor(tgtRow, tgtCol))
            if (existing) targetCellFormats.push(existing)
            continue
          }

          if (geometry.writeValues) {
            // Reference semantics: formulas paste VERBATIM (no ref
            // translation on Paste Special; the plain-paste path
            // shifts refs UI-side before import).
            const baseInput = srcFormula ?? srcDisplay
            const finalInput = applyPasteArithmetic(
              request.op,
              baseInput,
              targetDisplayByKey.get(keyFor(tgtRow, tgtCol)),
            )
            if (finalInput !== null) {
              wires.push(toImportCellWire(targetSheet.idx, tgtRow, tgtCol, finalInput))
            }
          }

          if (sourceFormats) {
            const effectiveFormat = getEffectiveFormat(
              srcCoord.row,
              srcCoord.col,
              sourceFormats.cellFormats,
              sourceFormats.rangeFormats,
            )
            if (effectiveFormat) {
              targetCellFormats.push({
                addr: toA1(tgtRow, tgtCol),
                format: effectiveFormat as CellFormatJSON,
              })
            }
            // No effective source format → no entry: the restore
            // clears the per-cell override so the target falls back
            // to its own range layers (static parity: map delete).
          }
        }
      }

      if (wires.length > 0) {
        const sessionId = await state.client.beginImport({ mode: 'direct' })
        let committed = false
        try {
          for (let index = 0; index < wires.length; index += DEFAULT_IMPORT_CELLS_PER_CHUNK) {
            await state.client.importChunk(
              sessionId,
              wires.slice(index, index + DEFAULT_IMPORT_CELLS_PER_CHUNK),
            )
          }
          const stats = await state.client.commitImport(sessionId)
          committed = true
          assertImportStatsOk(stats)
        } finally {
          if (!committed) await state.client.cancelImport(sessionId).catch(() => {})
        }
      }

      if (targetFormatSnapshot) {
        // restore_format_range_snapshot REPLACES per-cell formats
        // inside the rectangle (with the entries computed above) and
        // restores the CURRENT range-layer list unchanged — an exact
        // per-cell format write with no layer-list growth. Mirrors the
        // static backend's per-cell map writes; target-range layers
        // survive on both paths.
        await state.client.restoreFormatSnapshot({
          sheet: targetSparse.sheet,
          startRow: targetSparse.startRow,
          startCol: targetSparse.startCol,
          endRow: targetSparse.endRow,
          endCol: targetSparse.endCol,
          cellFormats: targetCellFormats,
          rangeFormats: targetFormatSnapshot.rangeFormats,
        })
      }

      const nextRevision = bumpRevision(state)
      return {
        kind: 'paste-range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? nextRevision,
        affectedRange: { ...geometry.affectedRange },
      }
    },
  })
}
