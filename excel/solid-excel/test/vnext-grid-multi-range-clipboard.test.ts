import { describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  clipboardStateAtom,
  copyClipboardAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { installGridClipboard } from '../src/grid/grid-clipboard'

const SHEET_ID = 'sheet-1'
const PREVIOUS_SOURCE = {
  sheetId: SHEET_ID,
  range: { rowStart: 6, rowEnd: 6, colStart: 2, colEnd: 2 },
}

function createMultiRegionRuntime(store: ReturnType<typeof createStore>) {
  const calls = { readRange: 0, clearRange: 0 }
  const primaryMergedRegion = {
    kind: 'range' as const,
    sheetId: SHEET_ID,
    anchor: { row: 1, col: 1 },
    focus: { row: 2, col: 2 },
  }
  const earlierRegion = {
    kind: 'cell' as const,
    sheetId: SHEET_ID,
    anchor: { row: 4, col: 4 },
    focus: { row: 4, col: 4 },
  }

  return {
    calls,
    runtime: {
      props: { sheetId: SHEET_ID, viewport: { rowCount: 9, colCount: 6 } },
      store,
      backend: {} as SpreadsheetBackend,
      selectionSnapshot: () => ({
        selection: primaryMergedRegion,
        activeCell: { sheetId: SHEET_ID, row: 1, col: 1 },
        range: { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
      }),
      selectionRegions: () => [earlierRegion, primaryMergedRegion],
      readRangeProjection: async () => {
        calls.readRange += 1
        throw new Error('multi-region clipboard must stop before reading a projection')
      },
      requestProjection: () => undefined,
      loadProjection: async () => undefined,
      clearSelectionRange: async () => {
        calls.clearRange += 1
      },
    },
  }
}

describe('grid clipboard multi-region boundary', () => {
  it('rejects a merged primary region instead of silently copying only that region', async () => {
    const store = createStore()
    store.setter(copyClipboardAtom, {
      source: PREVIOUS_SOURCE,
      serialization: 'tab-separated',
      includesFormulas: false,
      includesErrors: false,
      estimatedBytes: 8,
    })
    const { calls, runtime } = createMultiRegionRuntime(store)

    await expect(
      installGridClipboard(runtime as never).copySelectionToClipboard('cut'),
    ).resolves.toBeUndefined()

    expect(calls).toEqual({ readRange: 0, clearRange: 0 })
    expect(store.getter(clipboardStateAtom)).toMatchObject({
      status: 'error',
      source: PREVIOUS_SOURCE,
      payload: { source: PREVIOUS_SOURCE },
      error: {
        code: 'CLIPBOARD_MULTI_REGION_UNSUPPORTED',
        message:
          'Copying multiple selection regions is not supported. Select one region and try again.',
        severity: 'warning',
        source: 'validation',
      },
    })
  })
})
