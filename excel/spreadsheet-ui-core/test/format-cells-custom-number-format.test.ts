import { describe, expect, test } from 'vitest'
import { createStore } from '@einfach/core'
import {
  formatCellsEditorAtom,
  formatCellsPreviewText,
  numberFormatForCategory,
  openFormatCellsAtom,
  patchFormatCellsDraftAtom,
  runFormatCellsSaveAtom,
} from '../src/format-cells'

const RANGE = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

describe('Format Cells custom number format', () => {
  test('selecting Custom seeds an editable canonical pattern', () => {
    expect(numberFormatForCategory('custom')).toEqual({ kind: 'custom', pattern: '#,##0.00' })
  })

  test('uses the shared number formatter for the Custom preview', () => {
    expect(formatCellsPreviewText({ numberFormat: { kind: 'custom', pattern: '0.0"件"' } })).toBe(
      '1234.5件',
    )
  })

  test('keeps the Custom draft open when a post-write acknowledgement is invalid', async () => {
    const store = createStore()
    let receivedFormat: unknown
    store.setter(openFormatCellsAtom, { sheetId: 'sheet-1', range: RANGE })
    store.setter(patchFormatCellsDraftAtom, {
      numberFormat: { kind: 'custom', pattern: '0.0"件"' },
    })

    await expect(
      store.setter(runFormatCellsSaveAtom, {
        resolveSourceRanges: () => [RANGE],
        setFormatRange: (request) => {
          receivedFormat = request.format
          return {
            sheetId: request.sheetId,
            requestId: request.requestId! + 1,
            affectedRange: request.range,
          }
        },
        refreshProjection: () => undefined,
      }),
    ).resolves.toBe('outcome-unknown')

    expect(receivedFormat).toEqual({ numberFormat: { kind: 'custom', pattern: '0.0"件"' } })
    expect(store.getter(formatCellsEditorAtom)).toMatchObject({
      status: 'open',
      phase: 'outcome-unknown-blocked',
      pending: false,
      draft: { numberFormat: { kind: 'custom', pattern: '0.0"件"' } },
    })
  })
})
