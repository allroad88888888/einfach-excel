import type { Store } from '@einfach/core'
import {
  encodeSelectionAsPlainText,
  encodeSelectionForClipboard,
  getFilterHiddenRowsForSheet,
  publishCopyAsResultAtom,
  reportCopyAsStatusAtom,
  selectionSnapshotAtom,
  viewportFilterHiddenAtom,
  type CellRange,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { advanceSpreadsheetProjectionRequestIdAtom } from '../provider/atoms'
import {
  mirrorCopyAsResultForE2E,
  writePlainTextToClipboard,
  writeTextCopyAsToClipboard,
} from './copy-as-browser-clipboard'

/** Bound rich text encoding so a whole-column selection cannot block the tab. */
export const MAX_COPY_AS_CELLS = 100_000

function clipRectToCap(range: CellRange): CellRange {
  const rows = range.rowEnd - range.rowStart + 1
  const cols = range.colEnd - range.colStart + 1
  if (rows * cols <= MAX_COPY_AS_CELLS) return range
  if (cols >= MAX_COPY_AS_CELLS) {
    return { ...range, rowEnd: range.rowStart, colEnd: range.colStart + MAX_COPY_AS_CELLS - 1 }
  }
  return {
    ...range,
    rowEnd: range.rowStart + Math.max(1, Math.floor(MAX_COPY_AS_CELLS / cols)) - 1,
  }
}

function reportFailure(store: Store): void {
  store.setter(reportCopyAsStatusAtom, { kind: 'failed' })
}

/**
 * Copy display values as HTML, Markdown and Excel-compatible TSV. The core
 * encoder owns format serialization; this host adapter owns projection reads,
 * browser clipboard effects and Atom-backed user feedback.
 */
export async function dispatchCopyAs(
  store: Store,
  backend: SpreadsheetBackend,
  options: { sheetId?: string; range?: CellRange } = {},
): Promise<void> {
  const snapshot = store.getter(selectionSnapshotAtom)
  const sheetId = options.sheetId ?? snapshot.selection.sheetId ?? ''
  if (!sheetId) {
    reportFailure(store)
    return
  }
  const range = options.range ?? snapshot.range
  const hiddenRows = getFilterHiddenRowsForSheet(store.getter(viewportFilterHiddenAtom), sheetId)
  const rows = range.rowEnd - range.rowStart + 1
  const cols = range.colEnd - range.colStart + 1
  const totalCells = rows * cols

  if (totalCells > MAX_COPY_AS_CELLS) {
    await dispatchOversizedCopyAs(store, backend, sheetId, range, hiddenRows, totalCells)
    return
  }

  const requestId = store.setter(advanceSpreadsheetProjectionRequestIdAtom)
  if (requestId === null) {
    reportFailure(store)
    return
  }

  try {
    const result = await backend.readRangeProjection({
      kind: 'range',
      sheetId,
      requestId,
      reason: 'clipboard',
      range,
    })
    const encoded = encodeSelectionForClipboard({
      cells: result.cells,
      rect: {
        startRow: range.rowStart,
        startCol: range.colStart,
        endRow: range.rowEnd,
        endCol: range.colEnd,
      },
      hiddenRows,
    })
    const tier = await writeTextCopyAsToClipboard(encoded)
    if (tier === null) {
      reportFailure(store)
      return
    }

    store.setter(publishCopyAsResultAtom, encoded)
    mirrorCopyAsResultForE2E(encoded)
    store.setter(
      reportCopyAsStatusAtom,
      tier === 'rich-triple' ? null : { kind: 'fallback-plain-only' },
    )
  } catch {
    // A projection or encoder exception is a command failure, not an
    // unhandled event rejection. Preserve the previous successful snapshot.
    reportFailure(store)
  }
}

async function dispatchOversizedCopyAs(
  store: Store,
  backend: SpreadsheetBackend,
  sheetId: string,
  range: CellRange,
  hiddenRows: readonly number[],
  totalCells: number,
): Promise<void> {
  const requestId = store.setter(advanceSpreadsheetProjectionRequestIdAtom)
  if (requestId === null) {
    reportFailure(store)
    return
  }

  try {
    const clipped = clipRectToCap(range)
    const result = await backend.readRangeProjection({
      kind: 'range',
      sheetId,
      requestId,
      reason: 'clipboard',
      range: clipped,
    })
    const plainText = encodeSelectionAsPlainText({
      cells: result.cells,
      rect: {
        startRow: clipped.rowStart,
        startCol: clipped.colStart,
        endRow: clipped.rowEnd,
        endCol: clipped.colEnd,
      },
      hiddenRows,
    })
    if (!(await writePlainTextToClipboard(plainText))) {
      reportFailure(store)
      return
    }
    store.setter(reportCopyAsStatusAtom, {
      kind: 'too-large',
      cells: totalCells,
      limit: MAX_COPY_AS_CELLS,
    })
  } catch {
    reportFailure(store)
  }
}
