import { expect, test, vi } from 'vitest'
import { applySelectionFormatAtom, createSpreadsheetUi, initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom, setMultiRegionSelectionAtom, setSheetProtectionAtom,
  type SetFormatRangeRequest, type VisibleProjectionRequest } from '../src'
import { viewportSizeOverridesAtom } from '../src/viewport/size-overrides'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

const targets = [
  { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 0, scope: 'cell' as const },
  { rowStart: 90, rowEnd: 91, colStart: 3, colEnd: 3, scope: 'cell' as const },
]
const affected = { rowStart: 1, rowEnd: 91, colStart: 0, colEnd: 3 }
async function setup() {
  const project = (request: VisibleProjectionRequest) => ({ ...request, revision: 1,
    cells: [{ row: 1, col: 0, displayValue: '10', numericValue: 10, format: {} }] })
  const write = vi.fn(async (
    request: SetFormatRangeRequest, projection: VisibleProjectionRequest,
  ) => ({
    acknowledgement: { sheetId: request.sheetId, requestId: request.requestId!,
      revision: 1, affectedRange: affected },
    projection: project(projection),
    ...(request.format?.fontSize ? { sizes: {
      rowHeights: [{ rowIndex: 1, heightPx: 51 }, { rowIndex: 90, heightPx: 51 },
        { rowIndex: 91, heightPx: 51 }], colWidths: [],
    } } : {}),
  }))
  const read = vi.fn(async (request: VisibleProjectionRequest) => project(request))
  const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
    readVisibleProjection: read, setRangeFormat: write,
  }) })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  store.setter(setMultiRegionSelectionAtom, { regions: targets.map((target) => ({
    kind: 'range' as const, sheetId: 's',
    anchor: { row: target.rowStart, col: target.colStart },
    focus: { row: target.rowEnd, col: target.colEnd },
  })) })
  return { store, write, read }
}

test.each(['bold', 'italic', 'underline', 'text-color', 'fill-color', 'percent-format'] as const)(
  '%s sends all selected areas in one format request and does not refresh separately', async (action) => {
    const { store, write, read } = await setup()
    expect(await store.setter(applySelectionFormatAtom, action)).toBe('completed')
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0][0]).toMatchObject({ targets, writeMode: 'patch' })
    expect(read).toHaveBeenCalledTimes(1)
  },
)

test('font size publishes the native sizes for every area, including offscreen rows', async () => {
  const { store, write } = await setup()
  expect(await store.setter(applySelectionFormatAtom, { type: 'font-size', value: 36 }))
    .toBe('completed')
  expect(write).toHaveBeenCalledTimes(1)
  expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s)
    .toEqual({ 1: 51, 90: 51, 91: 51 })
})

test('a protected later area rejects the entire format request', async () => {
  const { store, write } = await setup()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected',
    unlockedRanges: [targets[0]],
  } })
  expect(await store.setter(applySelectionFormatAtom, 'bold')).toBe('blocked')
  expect(write).not.toHaveBeenCalled()
})

test('multi-area geometry borders remain explicitly blocked', async () => {
  const { store, write } = await setup()
  expect(await store.setter(applySelectionFormatAtom, 'all-borders')).toBe('blocked')
  expect(write).not.toHaveBeenCalled()
})

test('automatic color keeps the explicit clear field and per-area row/column scope', async () => {
  const { store, write } = await setup()
  store.setter(setMultiRegionSelectionAtom, { regions: [
    { kind: 'row', sheetId: 's', rowAnchor: 1, rowFocus: 1 },
    { kind: 'column', sheetId: 's', colAnchor: 3, colFocus: 3 },
  ] })
  expect(await store.setter(applySelectionFormatAtom, { type: 'text-color', value: null }))
    .toBe('completed')
  expect(write.mock.calls[0][0]).toMatchObject({ clearFormatFields: ['fgColor'], targets: [
    { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 7, scope: 'row' },
    { rowStart: 0, rowEnd: 99, colStart: 3, colEnd: 3, scope: 'column' },
  ] })
})
