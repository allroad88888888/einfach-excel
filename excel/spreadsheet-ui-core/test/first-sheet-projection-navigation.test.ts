import { expect, test } from 'vitest'
import { createSpreadsheetUi, selectCellAtom, setSelectionBoundsAtom, setViewportMetricsAtom,
  runVisibleProjectionAtom, viewportMetricsAtom, scrollToCellAtom, setViewportScrollAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest, type VisibleProjectionResult } from '../src'

test('first native frame corrects a name-box jump made before freeze, height and hidden data arrived', async () => {
  let resolve!: (result: VisibleProjectionResult) => void
  let request!: VisibleProjectionRequest
  const { store } = createSpreadsheetUi({ connection: {
    request: ((_command: string, p: { request: VisibleProjectionRequest }) => {
      request = p.request
      return new Promise<VisibleProjectionResult>((done) => { resolve = done })
    }) as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(setViewportMetricsAtom, { sheetId: 's', rowCount: 100, colCount: 8,
    rowHeight: 28, colWidth: 120, viewportWidth: 800, viewportHeight: 400,
    scrollTop: 0, scrollLeft: 0, overscanRows: 2, overscanCols: 2 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 39, col: 0 } })
  store.setter(scrollToCellAtom, { coord: { row: 39, col: 0 }, rowAlign: 'start' })
  expect(store.getter(viewportMetricsAtom).scrollTop).toBe(1092)
  const pending = store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 37, rowEnd: 56, colStart: 0, colEnd: 7 } })
  const reply = (): VisibleProjectionResult => ({ ...request, cells: [], rowHeights: [],
    visibility: { manualRows: [9], manualColumns: [], filterRows: [] },
    freeze: { rows: 1, cols: 0 }, frozen: { height: 40, width: 0, regions: [
      { pane: 'top', window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 7 },
        cells: [], rowHeights: [{ rowIndex: 0, heightPx: 40 }] },
    ] } })
  resolve(reply())
  expect(await pending).toEqual({ status: 'ready' })
  expect(store.getter(viewportMetricsAtom).scrollTop).toBe(1036)

  // 后续主动滚动，即便选区已不在画面内，也不能被首帧修正逻辑拉回。
  store.setter(setViewportScrollAtom, { scrollTop: 1500, scrollLeft: 0 })
  const scroll = store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 53, rowEnd: 70, colStart: 0, colEnd: 7 } })
  resolve(reply())
  await scroll
  expect(store.getter(viewportMetricsAtom).scrollTop).toBe(1500)
})
