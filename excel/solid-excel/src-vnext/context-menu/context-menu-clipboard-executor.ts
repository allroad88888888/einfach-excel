import type { Store } from '@einfach/core'
import {
  beginProjectionAtom,
  copyClipboardAtom,
  createClipboardTsvPastePlan,
  cutClipboardAtom,
  getFilterHiddenRowsForSheet,
  issueProjectionRequestIdAtom,
  markClipboardReadyAtom,
  pasteClipboardAtom,
  rejectProjectionAtom,
  resolveContentMutationAtom,
  resolveProjectionAtom,
  serializeClipboardTsv,
  setClipboardErrorAtom,
  viewportFilterHiddenAtom,
  type CellRange,
  type ClipboardTransferInput,
  type MenuCommandIntent,
  type RangeTsvChunkExportResult,
  type RangeTsvExportResult,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { refreshVisibleProjection, reportCommandFailure } from '../provider'
import {
  addClipboardOriginMarker,
  CLIPBOARD_CELL_LIMIT,
  clipboardError,
  dataRangeFromOrigin,
  rangeCellCount,
  readClipboardText,
  resultToClipboardText,
  targetToRange,
  toA1,
  writeClipboardText,
} from './context-menu-clipboard-text'

interface ClipboardExecutorOptions {
  readonly store: Store
  readonly backend: SpreadsheetBackend
}

export interface ContextMenuClipboardExecutor {
  execute(intent: MenuCommandIntent): Promise<void>
  clearTarget(sheetId: string, range: CellRange): Promise<boolean>
}

/** Executes clipboard and clear commands while preserving the existing Atom lifecycle. */
export function createContextMenuClipboardExecutor(
  options: ClipboardExecutorOptions,
): ContextMenuClipboardExecutor {
  const { store, backend } = options

  function filterHiddenRowsFor(sheetId: string): ReadonlySet<number> {
    return new Set(getFilterHiddenRowsForSheet(store.getter(viewportFilterHiddenAtom), sheetId))
  }

  async function readClipboardSource(sheetId: string, range: CellRange) {
    const begin = store.setter(beginProjectionAtom, {
      kind: 'range',
      sheetId,
      reason: 'clipboard',
      range,
    })
    if (begin.status !== 'started' || begin.request.kind !== 'range') return null
    try {
      const result = await backend.readRangeProjection(begin.request)
      const outcome = store.setter(resolveProjectionAtom, { request: begin.request, result })
      return outcome.status === 'accepted' && outcome.result.kind === 'range'
        ? outcome.result
        : null
    } catch (error: unknown) {
      store.setter(rejectProjectionAtom, { request: begin.request, error })
      throw error
    }
  }

  async function consumeClipboardSource(
    sheetId: string,
    range: CellRange,
    onChunk: (chunk: string) => void | Promise<void>,
  ): Promise<RangeTsvChunkExportResult | RangeTsvExportResult | null> {
    const requestId = store.setter(issueProjectionRequestIdAtom)
    if (requestId === null) {
      store.setter(
        setClipboardErrorAtom,
        clipboardError('Clipboard export could not allocate a request id.'),
      )
      return null
    }
    const request = {
      kind: 'export-range-tsv' as const,
      sheetId,
      range,
      requestId,
      hiddenRows: filterHiddenRowsFor(sheetId),
    }
    if (backend.consumeExportRangeTsvChunks) {
      return backend.consumeExportRangeTsvChunks(request, (chunk) => onChunk(chunk.text))
    }
    if (!backend.exportRangeTsv) {
      store.setter(
        setClipboardErrorAtom,
        clipboardError(
          `Clipboard range is too large: ${rangeCellCount(range)} cells. Backend streaming export unavailable.`,
        ),
      )
      return null
    }
    const result = await backend.exportRangeTsv(request)
    await onChunk(result.text)
    return result
  }

  async function copyRangeToClipboard(
    sheetId: string,
    range: CellRange,
    operation: 'copy' | 'cut' = 'copy',
  ): Promise<boolean> {
    let text: string
    let transferInput: ClipboardTransferInput
    if (rangeCellCount(range) > CLIPBOARD_CELL_LIMIT) {
      const chunks: string[] = []
      const result = await consumeClipboardSource(sheetId, range, (chunk) => {
        chunks.push(chunk)
      })
      if (!result) return false
      text = addClipboardOriginMarker(chunks.join('\n'), result.originAddr)
      const plan = createClipboardTsvPastePlan({
        text,
        fallbackOriginAddr: result.originAddr,
        targetOrigin: { row: range.rowStart, col: range.colStart },
      })
      transferInput = {
        source: { sheetId, range },
        serialization: 'tab-separated',
        includesFormulas: plan.includesFormulas,
        includesErrors: false,
        estimatedBytes: result.estimatedBytes ?? text.length,
        revision: result.revision ?? undefined,
      }
    } else {
      const result = await readClipboardSource(sheetId, range)
      if (!result) return false
      const data = resultToClipboardText(result, range, filterHiddenRowsFor(sheetId))
      text = serializeClipboardTsv(data)
      transferInput = {
        source: { sheetId, range },
        serialization: 'tab-separated',
        includesFormulas: data.cells.some((row) => row.some((field) => field.startsWith('='))),
        includesErrors: result.cells.some((cell) => cell.valueKind === 'error' || !!cell.error),
        estimatedBytes: text.length,
        revision: result.revision ?? undefined,
      }
    }
    store.setter(operation === 'cut' ? cutClipboardAtom : copyClipboardAtom, transferInput)
    if (!(await writeClipboardText(text))) {
      store.setter(setClipboardErrorAtom, clipboardError('Clipboard write failed.'))
      return false
    }
    store.setter(markClipboardReadyAtom)
    return true
  }

  function resolveClearRanges(sheetId: string, range: CellRange): CellRange[] | null {
    const resolution = store.setter(resolveContentMutationAtom, {
      kind: 'clear-range',
      sheetId,
      range,
    })
    if (resolution.status === 'blocked') return null
    return (resolution.ranges ?? [range]).map((sourceRange) => ({ ...sourceRange }))
  }

  async function clearResolvedRanges(sheetId: string, ranges: readonly CellRange[]): Promise<void> {
    if (ranges.length === 1 && rangeCellCount(ranges[0]) === 1) {
      await backend.setCellInput({
        kind: 'set-cell-input',
        sheetId,
        row: ranges[0].rowStart,
        col: ranges[0].colStart,
        input: '',
      })
      return
    }
    if (!backend.clearRange)
      throw new Error('Range clear is not supported by this spreadsheet backend.')
    for (const range of ranges) await backend.clearRange({ kind: 'clear-range', sheetId, range })
  }

  async function pasteClipboardRange(sheetId: string, targetRange: CellRange): Promise<void> {
    const text = await readClipboardText()
    if (text === null || text.length === 0) {
      store.setter(setClipboardErrorAtom, clipboardError('Clipboard read failed.'))
      return
    }
    const targetOrigin = { row: targetRange.rowStart, col: targetRange.colStart }
    const fallbackOriginAddr = toA1(targetOrigin)
    const plan = createClipboardTsvPastePlan({ text, fallbackOriginAddr, targetOrigin })
    const pasteRange = plan.estimatedRange
    const useChunkedImport =
      plan.cellCount > CLIPBOARD_CELL_LIMIT && backend.importCellChunks != null
    if (plan.cellCount > CLIPBOARD_CELL_LIMIT && !useChunkedImport) {
      store.setter(
        setClipboardErrorAtom,
        clipboardError(
          `Clipboard paste is too large: ${plan.cellCount} cells. Backend streaming import unavailable.`,
        ),
      )
      return
    }
    const resolution = store.setter(resolveContentMutationAtom, {
      kind: useChunkedImport ? 'import-cell-chunks' : 'paste-range',
      sheetId,
      range: pasteRange,
    })
    if (resolution.status === 'blocked') {
      store.setter(setClipboardErrorAtom, {
        code: resolution.diagnostic.code,
        message: resolution.diagnostic.message,
      })
      return
    }
    store.setter(pasteClipboardAtom, {
      source: {
        sheetId,
        range: dataRangeFromOrigin(plan.sourceOrigin, plan.rowCount, plan.colCount),
      },
      target: { sheetId, range: pasteRange },
      serialization: 'tab-separated',
      includesFormulas: plan.includesFormulas,
      estimatedBytes: plan.estimatedBytes,
    })
    if (useChunkedImport) {
      await backend.importCellChunks!({
        kind: 'import-cell-chunks',
        sheetId,
        chunks: (function* () {
          for (const chunk of plan.chunks()) yield chunk.cells
        })(),
        range: pasteRange,
      })
    } else {
      for (const chunk of plan.chunks()) {
        for (const cell of chunk.cells) {
          try {
            await backend.setCellInput({ kind: 'set-cell-input', sheetId, ...cell })
          } catch (error) {
            store.setter(
              setClipboardErrorAtom,
              reportCommandFailure(store, error, 'Paste into the selection failed.'),
            )
            await refreshVisibleProjection(store, backend, sheetId, 'selection')
            return
          }
        }
      }
    }
    store.setter(markClipboardReadyAtom)
    await refreshVisibleProjection(store, backend, sheetId, 'selection')
  }

  return {
    async execute(intent) {
      const range = targetToRange(intent.target)
      if (!range) return
      switch (intent.command) {
        case 'clipboard.copy':
          await copyRangeToClipboard(intent.target.sheetId, range)
          return
        case 'clipboard.cut': {
          const clearRanges = resolveClearRanges(intent.target.sheetId, range)
          if (clearRanges && (await copyRangeToClipboard(intent.target.sheetId, range, 'cut'))) {
            await clearResolvedRanges(intent.target.sheetId, clearRanges)
            store.setter(markClipboardReadyAtom)
            await refreshVisibleProjection(store, backend, intent.target.sheetId, 'selection')
          }
          return
        }
        case 'clipboard.paste':
          await pasteClipboardRange(intent.target.sheetId, range)
          return
        default:
          return
      }
    },
    async clearTarget(sheetId, range) {
      const ranges = resolveClearRanges(sheetId, range)
      if (!ranges) return false
      await clearResolvedRanges(sheetId, ranges)
      return true
    },
  }
}
