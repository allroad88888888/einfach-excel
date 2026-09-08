import { describe, expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  runVisibleProjectionAtom,
  selectCellAtom,
  setSelectionBoundsAtom,
  runSelectionSizeAtom,
  selectionSizePanelAtom,
  viewportSizeOverridesAtom,
  setSheetProtectionAtom,
  setRustWorkbookConnectionAtom,
  type RustWorkbookConnection,
  type RustWorkbookCommands,
  type VisibleProjectionRequest,
} from '../src'

async function setup(failure = false) {
  const projected = (p: VisibleProjectionRequest) => ({ ...p, cells: [], revision: 1 })
  const resize = vi.fn(async (p: RustWorkbookCommands['range.resize']['payload']) => {
    if (failure) throw new Error('Size write failed')
    return {
      projection: projected(p.projection),
      sizes: {
        rowHeights: p.axis === 'row' ? [{ rowIndex: 50, heightPx: p.pixels }] : [],
        colWidths: p.axis === 'column' ? [{ colIndex: 1, widthPx: p.pixels }] : [],
      },
    }
  })
  const request = vi.fn(async (command: string, payload: unknown) =>
    command === 'range.resize'
      ? resize(payload as RustWorkbookCommands['range.resize']['payload'])
      : projected((payload as { request: VisibleProjectionRequest }).request),
  )
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  const { store } = createSpreadsheetUi({ connection })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 1 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 50, col: 2 }, extend: true })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
    reason: 'viewport',
  })
  await store.setter(runSelectionSizeAtom, 'open')
  return { store, resize, request }
}

describe('selection sizes', () => {
  test.each(['row', 'column', 'reset'] as const)(
    '%s sends one RPC for the full selection',
    async (axis) => {
      const { store, resize, request } = await setup()
      await store.setter(runSelectionSizeAtom, { field: 'height', value: '40' })
      await store.setter(runSelectionSizeAtom, { field: 'width', value: '200' })
      expect(await store.setter(runSelectionSizeAtom, axis)).toBe(true)
      expect(resize).toHaveBeenCalledTimes(1)
      expect(resize.mock.calls[0]![0]).toMatchObject({
        axis,
        pixels: axis === 'row' ? 40 : axis === 'column' ? 200 : 0,
        range: { rowStart: 0, rowEnd: 50, colStart: 1, colEnd: 2 },
      })
      expect(request).toHaveBeenCalledTimes(2)
      expect(store.getter(selectionSizePanelAtom).target).toBeNull()
      if (axis === 'row')
        expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s?.['50']).toBe(40)
      if (axis === 'column')
        expect(store.getter(viewportSizeOverridesAtom).colWidthsBySheet.s?.['1']).toBe(200)
    },
  )
  test('invalid draft and protection block before Rust, cancel does not write', async () => {
    const { store, resize } = await setup()
    for (const value of ['', '15', '513', '16.5', 'NaN']) {
      await store.setter(runSelectionSizeAtom, { field: 'height', value })
      expect(await store.setter(runSelectionSizeAtom, 'row')).toBe(false)
    }
    store.setter(setSheetProtectionAtom, {
      sheetId: 's',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    expect(await store.setter(runSelectionSizeAtom, 'reset')).toBe(false)
    expect(store.getter(selectionSizePanelAtom).error).toContain('Unprotect')
    await store.setter(runSelectionSizeAtom, 'close')
    expect(resize).not.toHaveBeenCalled()
  })
  test('failure keeps the draft and existing sizes for retry', async () => {
    const { store } = await setup(true)
    const before = store.getter(viewportSizeOverridesAtom)
    await store.setter(runSelectionSizeAtom, { field: 'height', value: '44' })
    expect(await store.setter(runSelectionSizeAtom, 'row')).toBe(false)
    expect(store.getter(viewportSizeOverridesAtom)).toBe(before)
    expect(store.getter(selectionSizePanelAtom)).toMatchObject({
      height: '44',
      busy: false,
      error: 'Size write failed',
    })
  })
  test('pending blocks repeated writes and disposed connection cannot publish sizes', async () => {
    const { store, resize } = await setup()
    let finish!: (result: RustWorkbookCommands['range.resize']['result']) => void
    resize.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = store.setter(runSelectionSizeAtom, 'row')
    expect(await store.setter(runSelectionSizeAtom, 'row')).toBe(false)
    expect(await store.setter(runSelectionSizeAtom, 'close')).toBe(false)
    store.setter(setRustWorkbookConnectionAtom, null)
    finish({
      projection: {
        kind: 'visible-window',
        sheetId: 's',
        requestId: 2,
        window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
        cells: [],
      },
      sizes: { rowHeights: [{ rowIndex: 1, heightPx: 40 }], colWidths: [] },
    })
    expect(await pending).toBe(false)
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s).toBeUndefined()
    expect(resize).toHaveBeenCalledTimes(1)
  })
})
