import {
  nextHistoryTransactionId,
  pushHistoryAtom,
  resolveContentMutationAtom,
  type FormatToggleField,
  type HistoryEntry,
  type SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import { createHistoryEntryRecorder, reportCommandFailure } from '../provider'
import type { GridProjectionControllerApi } from './grid-projection-controller'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridViewStateApi } from './grid-view-state'

type GridFormatControllerRuntime = GridRuntimeBase &
  Pick<GridViewStateApi, 'selectionSnapshot' | 'projectionSnapshot'> &
  Pick<GridProjectionControllerApi, 'requestProjection' | 'loadProjection'>

export function installGridFormatController(runtime: GridFormatControllerRuntime) {
  const {
    store,
    backend,
    selectionSnapshot,
    projectionSnapshot,
    requestProjection,
    loadProjection,
  } = runtime
  const historyEntryRecorder = createHistoryEntryRecorder(backend)

  function recordAcknowledgedHistory(entry: HistoryEntry) {
    return historyEntryRecorder(entry, (nextEntry) => store.setter(pushHistoryAtom, nextEntry))
  }

  function reportUnknownFormatOutcome() {
    reportCommandFailure(
      store,
      new Error(
        'The acknowledged format mutation could not be recorded in history. Reload or reconcile workbook data before continuing.',
      ),
    )
  }

  function activeCellFormat(): SpreadsheetCellFormat {
    const selection = selectionSnapshot()
    const result = projectionSnapshot().result
    if (!result || result.sheetId !== selection.selection.sheetId) return {}
    const active = selection.activeCell
    const cell = result.cells.find(
      (candidate: { row: number; col: number }) =>
        candidate.row === active.row && candidate.col === active.col,
    )
    return { ...(cell?.format ?? {}) }
  }

  async function toggleActiveFormatField(field: FormatToggleField) {
    if (!backend.setFormatRange) return
    const snapshot = selectionSnapshot()
    const sheetId = snapshot.selection.sheetId
    if (!sheetId) return
    const range = snapshot.range
    const resolution = store.setter(resolveContentMutationAtom, { kind: 'set-format-range', sheetId, range })
    if (resolution.status === 'blocked') return
    const sourceRanges = resolution.ranges ?? [range]
    const current = activeCellFormat()
    const nextFormat: SpreadsheetCellFormat = { ...current, [field]: !current[field] }
    for (const sourceRange of sourceRanges) {
      const result = await backend.setFormatRange({ kind: 'set-format-range', sheetId, range: { ...sourceRange }, format: nextFormat })
      const revision = typeof result?.revision === 'number' ? result.revision : Number(result?.revision ?? 0) || 0
      if (
        recordAcknowledgedHistory({
          transactionId: nextHistoryTransactionId(),
          kind: 'format.set',
          sheetId,
          projectionRevision: revision,
          affectedRange: { ...(result?.affectedRange ?? sourceRange) },
        }) === 'rejected'
      ) {
        reportUnknownFormatOutcome()
        return
      }
    }
    await loadProjection(requestProjection())
  }

  return installGridFeature(runtime, { activeCellFormat, toggleActiveFormatField })
}

export type GridFormatControllerApi = ReturnType<typeof installGridFormatController>
