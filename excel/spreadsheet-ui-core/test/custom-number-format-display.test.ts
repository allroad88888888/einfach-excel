import { expect, test } from 'vitest'
import { createStore } from '@einfach/core'
import { applyVisibleFormats, usesNativeNumberDisplay } from '../src/rust-workbook/format-projection'
import { displayCell } from '../src/rust-workbook/cell-io'
import { cloneCell } from '../src/contracts/projection-helpers'
import type { RustCellSnapshot } from '../src/rust-workbook/wasm-types'
import {
  numberFormatPanelAtom, runNumberFormatPanelAtom, runVisibleProjectionAtom, selectCellAtom,
  setRustWorkbookConnectionAtom, setSelectionBoundsAtom, type SetFormatRangeRequest,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

const custom = { numberFormat: { kind: 'custom' as const, pattern: '0;[Red](0)' }, fgColor: '#00ff00' }
const snapshot: RustCellSnapshot = {
  sheet: 0, addr: 'A1', display: '-5', formattedDisplay: '(5) ', formattedColor: '#ff0000',
  formattedFill: { char: '-', at: 3 }, formattedPads: [{ char: ')', at: 2 }], type: 'number', isError: false, formula: '',
}

test('Rust display text, section color and fill reach the projected cell unchanged', () => {
  expect(usesNativeNumberDisplay('custom')).toBe(true)
  const cell = displayCell(snapshot)!
  expect(cell.displayValue).toBe('(5) ')
  expect(cell.numberFormatDisplay).toEqual({
    color: '#ff0000', fill: { char: '-', at: 3 }, pads: [{ char: ')', at: 2 }],
  })
  const [shown] = applyVisibleFormats([cell], { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }, {
    cellStyles: [{ addr: 'A1', format: custom }], rowStyles: [], columnStyles: [],
  })
  // 段颜色不写进 format：字体色按钮仍显示用户自己的颜色。
  expect(shown.displayValue).toBe('(5) ')
  expect(shown.format?.fgColor).toBe('#00ff00')
  expect(shown.numberFormatDisplay?.color).toBe('#ff0000')
  expect(cloneCell(shown).numberFormatDisplay).toEqual(shown.numberFormatDisplay)
})

test('a conditional font color wins over the section color but keeps fill and padding', () => {
  const [shown] = applyVisibleFormats([displayCell(snapshot)!],
    { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }, {
      cellStyles: [{ addr: 'A1', format: { ...custom, fgColor: '#0000ff' } }],
      rowStyles: [], columnStyles: [], conditionalFontColors: ['A1'],
    })
  expect(shown.format?.fgColor).toBe('#0000ff')
  expect(shown.numberFormatDisplay).toEqual({
    fill: { char: '-', at: 3 }, pads: [{ char: ')', at: 2 }],
  })
})

test.each([
  { formattedColor: 'red' }, { formattedFill: { char: '--', at: 0 } },
  { formattedFill: { char: '-', at: 9 } }, { formattedPads: [{ char: 'W', at: 4 }] },
])('invalid native display metadata is rejected: %o', (invalid) => {
  expect(() => displayCell({ ...snapshot, ...invalid })).toThrow('invalid number-format')
})

async function openPanel(preview: (code: string) => object) {
  const writes: SetFormatRangeRequest[] = []
  const connection = createTestRustWorkbookConnection({
    previewNumberFormat: async ({ numberFormat }) => preview(
      numberFormat.kind === 'custom' ? numberFormat.pattern : '') as never,
    setRangeFormat: async (
      request: SetFormatRangeRequest, projection: VisibleProjectionRequest,
    ) => {
      writes.push(request)
      return {
        acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
        projection: { kind: 'visible-window' as const, sheetId: projection.sheetId,
          requestId: projection.requestId, revision: 1, window: projection.window, cells: [] },
      }
    },
    readVisibleProjection: async (request) => ({
      kind: 'visible-window', sheetId: request.sheetId, requestId: request.requestId,
      revision: 0, window: request.window, cells: [{ row: 0, col: 0, displayValue: '(5)',
        valueKind: 'number', format: { numberFormat: { kind: 'custom', pattern: '0.0' } } }],
    }),
  })
  const store = createStore()
  store.setter(setRustWorkbookConnectionAtom, connection)
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 }, reason: 'viewport',
  })
  await store.setter(runNumberFormatPanelAtom, 'open')
  return { store, writes }
}

test('custom draft reopens with the stored code, blocks invalid codes and applies one format', async () => {
  const { store, writes } = await openPanel((code) => code === '0.0.0'
    ? { invalidCode: 'multiple-decimal-points' } : { text: `[${code}]`, color: '#ff0000' })
  expect(store.getter(numberFormatPanelAtom).draft).toMatchObject({ category: 'custom', code: '0.0' })
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ text: '[0.0]', color: '#ff0000' })
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { code: '0.0.0' } })
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ invalidCode: 'multiple-decimal-points' })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(writes).toHaveLength(0)
  expect(store.getter(numberFormatPanelAtom).draft.code).toBe('0.0.0')
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { code: '0.00' } })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(true)
  expect(writes.map((write) => write.format?.numberFormat))
    .toEqual([{ kind: 'custom', pattern: '0.00' }])
})

test('the preview carries the same fill and padding marks the grid renders', async () => {
  const { store } = await openPanel(() => ({
    text: ' 7', fill: { char: '-', at: 2 }, pads: [{ char: 'W', at: 0 }],
  }))
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({
    text: ' 7', fill: { char: '-', at: 2 }, pads: [{ char: 'W', at: 0 }],
  })
})
