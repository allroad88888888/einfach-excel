import {
  CLIPBOARD_ORIGIN_MARKER_PREFIX,
  copyClipboardAtom,
  createClipboardTsvPastePlan,
  cutClipboardAtom,
  getFilterHiddenRowsForSheet,
  issueProjectionRequestIdAtom,
  markClipboardReadyAtom,
  nextHistoryTransactionId,
  pasteClipboardAtom,
  pushHistoryAtom,
  resolveContentMutationAtom,
  serializeClipboardTsv,
  setClipboardErrorAtom,
  viewportFilterHiddenAtom,
  type ClipboardTransferInput,
} from '@einfach/spreadsheet-ui-core'
import { reportCommandFailure } from '../provider'
import { CLIPBOARD_CELL_LIMIT, getColumnLabel } from './grid-constants'
import { type GridRuntime } from './grid-runtime'

export function installGridClipboard(runtime: GridRuntime) {
  const { props, store, backend, selectionSnapshot, readRangeProjection, clearSelectionRange, requestProjection, loadProjection } = runtime

  async function writeClipboardText(text: string): Promise<boolean> {
    try { await navigator.clipboard.writeText(text); return true } catch { return false }
  }

  async function readClipboardText(): Promise<string | null> {
    try { return await navigator.clipboard.readText() } catch { return null }
  }

  async function copySelectionToClipboard(operation: 'copy' | 'cut' = 'copy') {
    const selection = selectionSnapshot()
    if (selection.selection.sheetId !== props.sheetId) return
    const range = selection.range
    const cellCount = (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
    const filterHiddenRows = new Set(getFilterHiddenRowsForSheet(store.getter(viewportFilterHiddenAtom), props.sheetId))
    const originAddr = `${getColumnLabel(range.colStart)}${range.rowStart + 1}`
    let text: string
    let transferInput: ClipboardTransferInput
    if (cellCount > CLIPBOARD_CELL_LIMIT) {
      const requestId = store.setter(issueProjectionRequestIdAtom)
      if (requestId === null) {
        store.setter(setClipboardErrorAtom, { code: 'BACKEND_ERROR', message: 'Clipboard request identity space is exhausted.' })
        return
      }
      const streamRequest = { kind: 'export-range-tsv' as const, sheetId: props.sheetId, range, requestId, hiddenRows: filterHiddenRows }
      const chunks: string[] = []
      let streamResult: Awaited<ReturnType<NonNullable<typeof backend.consumeExportRangeTsvChunks>>> | Awaited<ReturnType<NonNullable<typeof backend.exportRangeTsv>>> | null = null
      if (backend.consumeExportRangeTsvChunks) streamResult = await backend.consumeExportRangeTsvChunks(streamRequest, (chunk: { text: string }) => chunks.push(chunk.text))
      else if (backend.exportRangeTsv) {
        streamResult = await backend.exportRangeTsv(streamRequest)
        chunks.push(streamResult.text)
      } else {
        store.setter(setClipboardErrorAtom, { code: 'BACKEND_ERROR', message: `Clipboard range is too large: ${cellCount} cells. Backend streaming export unavailable.` })
        return
      }
      const resolvedOrigin = streamResult?.originAddr ?? originAddr
      text = `${CLIPBOARD_ORIGIN_MARKER_PREFIX}${resolvedOrigin}\n${chunks.join('\n')}`
      const plan = createClipboardTsvPastePlan({ text, fallbackOriginAddr: resolvedOrigin, targetOrigin: { row: range.rowStart, col: range.colStart } })
      transferInput = { source: { sheetId: props.sheetId, range }, serialization: 'tab-separated', includesFormulas: plan.includesFormulas, includesErrors: false, estimatedBytes: streamResult?.estimatedBytes ?? text.length, revision: streamResult?.revision ?? undefined }
    } else {
      const result = await readRangeProjection(props.sheetId, range, 'clipboard')
      if (result === null) return
      const cellsByKey = new Map<string, (typeof result.cells)[number]>()
      result.cells.forEach((cell: (typeof result.cells)[number]) => cellsByKey.set(`${cell.row}:${cell.col}`, cell))
      const cells: string[][] = []
      let firstEmittedRow = -1
      for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
        if (filterHiddenRows.has(row)) continue
        if (firstEmittedRow === -1) firstEmittedRow = row
        const fields: string[] = []
        for (let col = range.colStart; col <= range.colEnd; col += 1) fields.push(cellsByKey.get(`${row}:${col}`)?.formula ?? cellsByKey.get(`${row}:${col}`)?.displayValue ?? '')
        cells.push(fields)
      }
      text = serializeClipboardTsv({ originAddr: firstEmittedRow === -1 ? originAddr : `${getColumnLabel(range.colStart)}${firstEmittedRow + 1}`, cells })
      transferInput = { source: { sheetId: props.sheetId, range }, serialization: 'tab-separated', includesFormulas: cells.some((row) => row.some((field) => field.startsWith('='))), includesErrors: result.cells.some((cell: (typeof result.cells)[number]) => cell.valueKind === 'error' || !!cell.error), estimatedBytes: text.length, revision: result.revision ?? undefined }
    }
    store.setter(operation === 'cut' ? cutClipboardAtom : copyClipboardAtom, transferInput)
    if (!(await writeClipboardText(text))) {
      store.setter(setClipboardErrorAtom, { code: 'BACKEND_ERROR', message: 'Clipboard write failed.' })
      return
    }
    store.setter(markClipboardReadyAtom)
    if (operation === 'cut') await clearSelectionRange()
  }

  async function pasteFromClipboard() {
    const selection = selectionSnapshot()
    if (selection.selection.sheetId !== props.sheetId) return
    const text = await readClipboardText()
    if (text === null || text.length === 0) {
      store.setter(setClipboardErrorAtom, { code: 'BACKEND_ERROR', message: 'Clipboard read failed.' })
      return
    }
    const targetOrigin = { row: selection.activeCell.row, col: selection.activeCell.col }
    const plan = createClipboardTsvPastePlan({ text, fallbackOriginAddr: `${getColumnLabel(targetOrigin.col)}${targetOrigin.row + 1}`, targetOrigin })
    const pasteRange = plan.estimatedRange
    const sourceRange = { rowStart: plan.sourceOrigin.row, rowEnd: plan.sourceOrigin.row + plan.rowCount - 1, colStart: plan.sourceOrigin.col, colEnd: plan.sourceOrigin.col + plan.colCount - 1 }
    const resolution = store.setter(resolveContentMutationAtom, { kind: 'paste-range', sheetId: props.sheetId, range: pasteRange })
    if (resolution.status === 'blocked') {
      store.setter(setClipboardErrorAtom, { code: resolution.diagnostic.code, message: resolution.diagnostic.message })
      return
    }
    store.setter(pasteClipboardAtom, { source: { sheetId: props.sheetId, range: sourceRange }, target: { sheetId: props.sheetId, range: pasteRange }, serialization: 'tab-separated', includesFormulas: plan.includesFormulas, estimatedBytes: plan.estimatedBytes })
    const writes: Array<{ row: number; col: number; input: string }> = []
    for (const chunk of plan.chunks()) for (const cell of chunk.cells) {
      const cellResolution = store.setter(resolveContentMutationAtom, { kind: 'paste-range', sheetId: props.sheetId, cell: { row: cell.row, col: cell.col } })
      if (cellResolution.status === 'blocked' || cellResolution.cell === undefined) {
        store.setter(setClipboardErrorAtom, { code: cellResolution.status === 'blocked' ? cellResolution.diagnostic.code : 'MUTATION_INVALID_TARGET', message: cellResolution.status === 'blocked' ? cellResolution.diagnostic.message : 'Paste target cell could not be resolved.' })
        return
      }
      writes.push({ row: cellResolution.cell.row, col: cellResolution.cell.col, input: cell.input })
    }
    const affectedRanges = resolution.ranges ?? [pasteRange]
    const affectedRange = affectedRanges.reduce((acc: typeof pasteRange, range: typeof pasteRange) => ({ rowStart: Math.min(acc.rowStart, range.rowStart), rowEnd: Math.max(acc.rowEnd, range.rowEnd), colStart: Math.min(acc.colStart, range.colStart), colEnd: Math.max(acc.colEnd, range.colEnd) }), { ...affectedRanges[0] })
    if (writes.length > 0 && backend.importCells) {
      const result = await backend.importCells({ kind: 'import-cells', sheetId: props.sheetId, cells: writes, range: affectedRange })
      const revision = typeof result?.revision === 'number' ? result.revision : Number(result?.revision ?? 0) || 0
      store.setter(pushHistoryAtom, { transactionId: nextHistoryTransactionId(), kind: 'cells.import', sheetId: props.sheetId, projectionRevision: revision, affectedRange: result?.affectedRange ? { ...result.affectedRange } : affectedRange })
    } else if (writes.length > 0) for (const write of writes) {
      let result: Awaited<ReturnType<typeof backend.setCellInput>>
      try {
        result = await backend.setCellInput({ kind: 'set-cell-input', sheetId: props.sheetId, row: write.row, col: write.col, input: write.input })
      } catch (error) {
        store.setter(setClipboardErrorAtom, reportCommandFailure(store, error, 'Paste into the selection failed.'))
        await loadProjection(requestProjection())
        return
      }
      const revision = typeof result?.revision === 'number' ? result.revision : Number(result?.revision ?? 0) || 0
      store.setter(pushHistoryAtom, { transactionId: nextHistoryTransactionId(), kind: 'cell.set-input', sheetId: props.sheetId, projectionRevision: revision, affectedRange: result?.affectedRange ? { ...result.affectedRange } : { rowStart: write.row, rowEnd: write.row, colStart: write.col, colEnd: write.col } })
    }
    store.setter(markClipboardReadyAtom)
    await loadProjection(requestProjection())
  }

  Object.assign(runtime, { writeClipboardText, readClipboardText, copySelectionToClipboard, pasteFromClipboard })
}
