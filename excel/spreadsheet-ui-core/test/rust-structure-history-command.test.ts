import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  runRustHistoryAtom,
  workbookDocumentAtom,
  selectionSnapshotAtom,
  viewportMetricsAtom,
  setViewportMetricsAtom,
  viewportSizeOverridesAtom,
  selectCellAtom,
  rustHistoryPanelAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'
import { structureProjectionRequest } from '../src/rust-workbook/structure-geometry'
import type { RustHistoryState } from '../src/history/rust-history-types'

const before = { id: 's', key: '1', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }
const after = { ...before, rowCount: 98 }
const visibility = { manualRows: [], manualColumns: [], filterRows: [] }
type Input = RustWorkbookCommands['history.apply']['payload']
async function setup() {
  const state: RustHistoryState = {
    undoCount: 1,
    redoCount: 0,
    notice: null,
    entries: [
      {
        sheetIndex: 0,
        sheetKey: '1',
        label: 'Insert rows',
        structuralEdit: { action: 'insert-rows', at: 90, count: 2 },
        range: { rowStart: 90, rowEnd: 91, colStart: 0, colEnd: 7 },
      },
    ],
  }
  const response = (input: Input) => ({
    sheetId: 's',
    sheets: [after],
    visibility,
    range: { rowStart: 0, rowEnd: 99, colStart: 0, colEnd: 7 },
    sizes: { rowHeights: [{ rowIndex: 97, heightPx: 60 }], colWidths: [] },
    projection: {
      ...structureProjectionRequest(input.projection, after),
      cells: [],
      visibility,
      revision: 2,
      history: { ...state, undoCount: 0, redoCount: 1 },
    },
  })
  const apply = vi.fn(async (input: Input) => response(input))
  const request = vi.fn(async (command: string, payload: unknown) =>
    command === 'history.apply'
      ? apply(payload as Input)
      : {
          ...(payload as { request: VisibleProjectionRequest }).request,
          cells: [],
          revision: 1,
          history: state,
        },
  )
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Test', sheets: [before] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 99, col: 7 } })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom),
    sheetId: 's',
    rowCount: 100,
    colCount: 8,
    scrollTop: 2000,
    viewportHeight: 300,
  })
  store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { s: { 99: 60 } },
    colWidthsBySheet: {},
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 90, rowEnd: 99, colStart: 0, colEnd: 7 },
  })
  return { store, apply, response, request }
}

test('undo synchronizes full canvas geometry and clears deleted-tail caches in one RPC', async () => {
  const { store, apply, request } = await setup()
  expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(true)
  expect(apply).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledTimes(2)
  expect(store.getter(workbookDocumentAtom).sheets).toEqual([after])
  expect(store.getter(viewportMetricsAtom).rowCount).toBe(98)
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 97, col: 7 })
  expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s).toEqual({ 97: 60 })
})

test.each(['bounds', 'tail', 'visibility', 'identity'])(
  'rejects mismatched structural history %s without publishing metadata',
  async (kind) => {
    const { store, apply, response } = await setup()
    const original = store.getter(workbookDocumentAtom)
    apply.mockImplementationOnce(async (input) => {
      const result = response(input)
      if (kind === 'bounds') result.sheets = [{ ...after, colCount: 7 }]
      if (kind === 'tail') result.range.rowEnd = 91
      if (kind === 'visibility') result.visibility = undefined as never
      if (kind === 'identity') result.sheets = [{ ...after, key: 'unknown' }]
      return result
    })
    expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
    expect(store.getter(workbookDocumentAtom)).toBe(original)
    expect(store.getter(rustHistoryPanelAtom).error).not.toBeNull()
  },
)
