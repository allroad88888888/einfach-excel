import { describe, expect, test, vi } from 'vitest'
import {
  activeSheetSplitWindowAtom,
  activateSheetTabAtom,
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runFreezeAtom,
  runSplitWindowAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  setSplitWindowRatioAtom,
  setSplitWindowScrollAtom,
  setViewportMetricsAtom,
  viewportMetricsAtom,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

function createTestUi() {
  let frozen = { rows: 0, cols: 0 }
  const freezeCalls: Array<{ rows: number; cols: number }> = []
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'sheet.freeze') {
      const input = payload as {
        rows: number
        cols: number
        projection: VisibleProjectionRequest
      }
      frozen = { rows: input.rows, cols: input.cols }
      freezeCalls.push(frozen)
      return {
        projection: {
          ...input.projection,
          revision: freezeCalls.length + 1,
          cells: [],
          freeze: frozen,
        },
      }
    }
    const req = (payload as { request: VisibleProjectionRequest }).request
    return {
      ...req,
      revision: 1,
      cells: [],
      freeze: frozen,
    }
  })
  const connection: RustWorkbookConnection = {
    request: request as RustWorkbookConnection['request'],
    dispose() {},
  }
  const core = createSpreadsheetUi({ connection })
  core.store.setter(initializeWorkbookDocumentAtom, {
    title: 'SplitTest',
    sheets: [
      { id: 's1', index: 0, name: 'Sheet1', rowCount: 100, colCount: 20 },
      { id: 's2', index: 1, name: 'Sheet2', rowCount: 100, colCount: 20 },
    ],
  })
  core.store.setter(setViewportMetricsAtom, {
    ...core.store.getter(viewportMetricsAtom),
    sheetId: 's1',
    rowCount: 100,
    colCount: 20,
    rowHeight: 24,
    colWidth: 100,
    viewportHeight: 480,
    viewportWidth: 800,
    scrollTop: 0,
    scrollLeft: 0,
  })
  return { core, freezeCalls }
}

describe('split window state and commands', () => {
  test('selection split follows Excel rules for A1, row-only, col-only, and quad cells', async () => {
    const { core } = createTestUi()

    // Active cell A1 -> 4-way quad split at 50%/50%
    expect(await core.store.setter(runSplitWindowAtom, 'selection')).toBe(true)
    expect(core.store.getter(activeSheetSplitWindowAtom)).toMatchObject({
      mode: 'quad',
      horizontalRatio: 0.5,
      verticalRatio: 0.5,
    })

    // Active cell A6 (row 5, col 0) -> horizontal split only at row 5 (120 / 480 = 0.25)
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 5, col: 0 } })
    expect(await core.store.setter(runSplitWindowAtom, 'selection')).toBe(true)
    expect(core.store.getter(activeSheetSplitWindowAtom)).toMatchObject({
      mode: 'horizontal',
      horizontalRatio: 0.25,
      verticalRatio: null,
      secondaryScrollTop: 120,
    })

    // Active cell D1 (row 0, col 3) -> vertical split only at col 3 (300 / 800 = 0.375)
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 0, col: 3 } })
    expect(await core.store.setter(runSplitWindowAtom, 'selection')).toBe(true)
    expect(core.store.getter(activeSheetSplitWindowAtom)).toMatchObject({
      mode: 'vertical',
      horizontalRatio: null,
      verticalRatio: 0.375,
      secondaryScrollLeft: 300,
    })

    // Active cell C6 (row 5, col 2) -> quad split
    core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 5, col: 2 } })
    expect(await core.store.setter(runSplitWindowAtom, 'selection')).toBe(true)
    expect(core.store.getter(activeSheetSplitWindowAtom)).toMatchObject({
      mode: 'quad',
      horizontalRatio: 0.25,
      verticalRatio: 0.25,
      secondaryScrollTop: 120,
      secondaryScrollLeft: 200,
    })
  })

  test('ratio clamping, single-axis clear, scroll updates, and per-sheet isolation', async () => {
    const { core } = createTestUi()
    await core.store.setter(runSplitWindowAtom, 'selection')

    core.store.setter(setSplitWindowRatioAtom, { axis: 'horizontal', ratio: 0.02 })
    expect(core.store.getter(activeSheetSplitWindowAtom).horizontalRatio).toBe(0.15)
    core.store.setter(setSplitWindowRatioAtom, { axis: 'vertical', ratio: 0.99 })
    expect(core.store.getter(activeSheetSplitWindowAtom).verticalRatio).toBe(0.85)

    core.store.setter(setSplitWindowScrollAtom, { scrollTop: 640, scrollLeft: 320 })
    expect(core.store.getter(activeSheetSplitWindowAtom)).toMatchObject({
      secondaryScrollTop: 640,
      secondaryScrollLeft: 320,
    })

    // Clearing vertical axis leaves horizontal split intact
    core.store.setter(setSplitWindowRatioAtom, { axis: 'vertical', ratio: null })
    expect(core.store.getter(activeSheetSplitWindowAtom).mode).toBe('horizontal')

    // Sheet2 stays unsplit; returning to Sheet1 restores its split
    core.store.setter(activateSheetTabAtom, { sheetId: 's2' })
    expect(core.store.getter(activeSheetSplitWindowAtom).mode).toBe('none')
    core.store.setter(activateSheetTabAtom, { sheetId: 's1' })
    expect(core.store.getter(activeSheetSplitWindowAtom).mode).toBe('horizontal')

    // Clearing the remaining axis returns to 'none'
    core.store.setter(setSplitWindowRatioAtom, { axis: 'horizontal', ratio: null })
    expect(core.store.getter(activeSheetSplitWindowAtom).mode).toBe('none')
  })

  test('split window and freeze panes are mutually exclusive', async () => {
    const { core, freezeCalls } = createTestUi()
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's1',
      reason: 'viewport',
      window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 8 },
    })

    // Freezing clears an existing split
    await core.store.setter(runSplitWindowAtom, 'horizontal')
    expect(core.store.getter(activeSheetSplitWindowAtom).mode).toBe('horizontal')
    expect(await core.store.setter(runFreezeAtom, 'first-row')).toBe(true)
    expect(core.store.getter(activeSheetSplitWindowAtom).mode).toBe('none')
    expect(freezeCalls).toEqual([{ rows: 1, cols: 0 }])

    // Splitting automatically unfreezes first
    expect(await core.store.setter(runSplitWindowAtom, 'vertical')).toBe(true)
    expect(freezeCalls).toEqual([
      { rows: 1, cols: 0 },
      { rows: 0, cols: 0 },
    ])
    expect(core.store.getter(activeSheetSplitWindowAtom).mode).toBe('vertical')
  })
})
