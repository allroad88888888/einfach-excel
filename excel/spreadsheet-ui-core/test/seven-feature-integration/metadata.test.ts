import { expect, test } from 'vitest'
import { displayCell } from '../../src/rust-workbook/cell-io'
import { applyVisibleFormats } from '../../src/rust-workbook/format-projection'
import { validProjectionMetadata } from '../../src/projection/metadata-validation'
import type { RustCellSnapshot } from '../../src/rust-workbook/wasm-types'

test('blank notes survive sparse filtering and revoked conditional icons are removed', () => {
  const snapshot = { addr: 'A1', display: '', formula: '', type: 'null', noteIndicator: true }
  const blank = displayCell(snapshot as RustCellSnapshot)!
  expect(blank.noteIndicator).toBe(true)
  const source = { ...blank, displayValue: '50', conditionalIcon: {
    set: 'three-arrows' as const, index: 2 as const, showValue: false,
  } }
  const cells = applyVisibleFormats([source],
    { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    { cellStyles: [], rowStyles: [], columnStyles: [] })
  expect(cells[0].noteIndicator).toBe(true)
  expect(cells[0].conditionalIcon).toBeUndefined()
  expect(cells[0].displayValue).toBe('50')
})

test('blank comment markers survive transport independently of note text and legacy thread ids', () => {
  const blank = displayCell({ addr: 'B2', display: '', formula: '', type: 'null',
    commentIndicator: true } as RustCellSnapshot)!
  expect(blank).toMatchObject({ row: 1, col: 1, displayValue: '', commentIndicator: true })
  expect(blank.noteIndicator).toBeUndefined()
  expect(blank.commentThreadId).toBeUndefined()
  expect(validProjectionMetadata({ kind: 'visible-window', sheetId: 's', requestId: 1,
    window: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 }, cells: [blank] })).toBe(true)
})

test('projection rejects invalid native icon and permission metadata', () => {
  const result = { kind: 'visible-window' as const, sheetId: 's', requestId: 1,
    window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }, cells: [],
    protection: { mode: 'protected' as const, unlockedRanges: [] } }
  expect(validProjectionMetadata(result)).toBe(true)
  expect(validProjectionMetadata({ ...result, protection: {
    mode: 'protected', unlockedRanges: [{ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 16384 }],
  } })).toBe(false)
  expect(validProjectionMetadata({ ...result, cells: [{ row: 0, col: 0, displayValue: '1',
    conditionalIcon: { set: 'three-arrows', index: 3 as 2, showValue: true } }] })).toBe(false)
})
