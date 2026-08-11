import type { Store } from '@einfach/core'
import {
  encodeSelectionAsImage,
  getFilterHiddenRowsForSheet,
  publishCopyAsResultAtom,
  reportCopyAsStatusAtom,
  selectionSnapshotAtom,
  viewportFilterHiddenAtom,
  type CellRange,
  type CopyAsResult,
  type EncodeSelectionAsImageResult,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { mirrorCopyAsResultForE2E, writeImageCopyAsToClipboard } from './copy-as-browser-clipboard'
import { readCopyAsImageSizeEstimate, withCopyAsHostImageRenderer } from './copy-as-image-renderer'

/** Copy the active range as PNG while keeping every user-visible outcome in atoms. */
export async function dispatchCopyAsImage(
  store: Store,
  backend: SpreadsheetBackend,
  options: { sheetId?: string; range?: CellRange } = {},
): Promise<void> {
  const snapshot = store.getter(selectionSnapshotAtom)
  const sheetId = options.sheetId ?? snapshot.selection.sheetId ?? ''
  if (!sheetId) {
    store.setter(reportCopyAsStatusAtom, { kind: 'image-failed' })
    return
  }
  const range = options.range ?? snapshot.range
  const estimate = await readCopyAsImageSizeEstimate(backend, sheetId, range)

  let encoded: EncodeSelectionAsImageResult
  try {
    encoded = await encodeSelectionAsImage(
      {
        sheetId,
        rect: {
          startRow: range.rowStart,
          startCol: range.colStart,
          endRow: range.rowEnd,
          endCol: range.colEnd,
        },
        ...estimate,
        hiddenRows: getFilterHiddenRowsForSheet(store.getter(viewportFilterHiddenAtom), sheetId),
      },
      withCopyAsHostImageRenderer(backend),
    )
  } catch {
    store.setter(reportCopyAsStatusAtom, { kind: 'image-failed' })
    return
  }

  if (!encoded.ok) {
    reportImageEncodingFailure(store, encoded)
    return
  }

  const result: CopyAsResult = { kind: 'image', mimeType: 'image/png', blob: encoded.blob }
  store.setter(publishCopyAsResultAtom, result)
  mirrorCopyAsResultForE2E(result)
  const tier = await writeImageCopyAsToClipboard(encoded.blob)
  store.setter(
    reportCopyAsStatusAtom,
    tier === 'system-clipboard' ? null : { kind: 'fallback-plain-only' },
  )
}

function reportImageEncodingFailure(
  store: Store,
  result: Exclude<EncodeSelectionAsImageResult, { ok: true }>,
): void {
  switch (result.reason) {
    case 'no-backend':
      store.setter(reportCopyAsStatusAtom, { kind: 'image-no-backend' })
      return
    case 'too-large':
      store.setter(reportCopyAsStatusAtom, {
        kind: 'image-too-large',
        estimatedPixels: result.estimatedPixels ?? 0,
        limit: result.limit ?? 0,
      })
      return
    case 'empty-bytes':
      store.setter(reportCopyAsStatusAtom, { kind: 'image-failed' })
  }
}
