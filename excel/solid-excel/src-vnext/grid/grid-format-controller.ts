import {
  nextHistoryTransactionId,
  pushHistoryAtom,
  resolveContentMutationAtom,
  type FormatToggleField,
  type SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import { type GridRuntime } from './grid-runtime'

export function installGridFormatController(runtime: GridRuntime) {
  const { store, backend, selectionSnapshot, projectionSnapshot, requestProjection, loadProjection } = runtime

  function activeCellFormat(): SpreadsheetCellFormat {
    const selection = selectionSnapshot()
    const result = projectionSnapshot().result
    if (!result || result.sheetId !== selection.selection.sheetId) return {}
    const active = selection.activeCell
    const cell = result.cells.find((candidate: { row: number; col: number }) => candidate.row === active.row && candidate.col === active.col)
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
      store.setter(pushHistoryAtom, { transactionId: nextHistoryTransactionId(), kind: 'format.set', sheetId, projectionRevision: revision, affectedRange: { ...(result?.affectedRange ?? sourceRange) } })
    }
    await loadProjection(requestProjection())
  }

  Object.assign(runtime, { activeCellFormat, toggleActiveFormatField })
}
