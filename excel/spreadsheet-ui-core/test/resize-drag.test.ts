import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectGridHeaderAtom,
  selectCellAtom,
  runResizeDragAtom,
  resizeDragAtom,
  selectionSizePanelAtom,
  selectionSnapshotAtom,
  viewportSizeOverridesAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

async function setup() {
  const project = (p: VisibleProjectionRequest) => ({ ...p, cells: [], revision: 1 })
  const resize = vi.fn(async (p: RustWorkbookCommands['range.resize']['payload']) => ({
    projection: project(p.projection),
    sizes: {
      rowHeights: p.axis === 'row' ? [{ rowIndex: p.range.rowStart, heightPx: p.pixels }] : [],
      colWidths: p.axis === 'column' ? [{ colIndex: p.range.colStart, widthPx: p.pixels }] : [],
    },
  }))
  const request = vi.fn(async (command: string, p: unknown) =>
    command === 'range.resize'
      ? resize(p as RustWorkbookCommands['range.resize']['payload'])
      : project((p as { request: VisibleProjectionRequest }).request),
  )
  const { store } = createSpreadsheetUi({
    connection: {
      request: request as RustWorkbookConnection['request'],
      dispose() {},
    },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    reason: 'viewport',
  })
  return { store, resize, request }
}

test.each(['row', 'column'] as const)(
  '%s drag previews without changing data, then sends one native write',
  async (axis) => {
    const r = await setup()
    const before = r.store.getter(viewportSizeOverridesAtom)
    const selection = r.store.getter(selectionSnapshotAtom)
    expect(
      r.store.setter(runResizeDragAtom, {
        phase: 'start',
        axis,
        index: 2,
        pointerId: 7,
        position: 100,
      }),
    ).toBe(true)
    const initial = r.store.getter(resizeDragAtom)!.initial
    r.store.setter(runResizeDragAtom, { phase: 'move', pointerId: 7, position: 120 })
    r.store.setter(runResizeDragAtom, { phase: 'move', pointerId: 7, position: 140 })
    expect(r.store.getter(resizeDragAtom)?.pixels).toBe(initial + 40)
    expect(r.store.getter(viewportSizeOverridesAtom)).toBe(before)
    expect(r.resize).not.toHaveBeenCalled()
    expect(await r.store.setter(runResizeDragAtom, { phase: 'commit', pointerId: 7 })).toBe(true)
    expect(r.resize).toHaveBeenCalledTimes(1)
    expect(r.resize.mock.calls[0][0]).toMatchObject({
      axis,
      pixels: initial + 40,
      range:
        axis === 'row'
          ? { rowStart: 2, rowEnd: 2, colStart: 0, colEnd: 7 }
          : { rowStart: 0, rowEnd: 99, colStart: 2, colEnd: 2 },
    })
    expect(r.request).toHaveBeenCalledTimes(2)
    expect(r.store.getter(selectionSnapshotAtom)).toEqual(selection)
    expect(r.store.getter(selectionSizePanelAtom).target).toBeNull()
  },
)

test('selected rows resize as one range', async () => {
  const { store, resize } = await setup()
  await store.setter(selectGridHeaderAtom, { kind: 'row', sheetId: 's', index: 2 })
  await store.setter(selectGridHeaderAtom, { kind: 'row', sheetId: 's', index: 4, extend: true })
  store.setter(runResizeDragAtom, {
    phase: 'start',
    axis: 'row',
    index: 3,
    pointerId: 1,
    position: 0,
  })
  store.setter(runResizeDragAtom, { phase: 'move', pointerId: 1, position: 30 })
  await store.setter(runResizeDragAtom, { phase: 'commit', pointerId: 1 })
  expect(resize.mock.calls[0][0].range).toEqual({ rowStart: 2, rowEnd: 4, colStart: 0, colEnd: 7 })
})

test('wrong pointer, cancellation and no movement never write', async () => {
  const { store, resize } = await setup()
  for (const phase of ['cancel', 'commit'] as const) {
    store.setter(runResizeDragAtom, {
      phase: 'start',
      axis: 'row',
      index: 1,
      pointerId: 1,
      position: 0,
    })
    expect(store.setter(runResizeDragAtom, { phase: 'move', pointerId: 2, position: 40 })).toBe(
      false,
    )
    await store.setter(runResizeDragAtom, { phase, pointerId: 1 })
  }
  expect(resize).not.toHaveBeenCalled()
  expect(store.getter(resizeDragAtom)).toBeNull()
})

test.each([
  ['row', 16, 512],
  ['column', 40, 1024],
] as const)('%s preview clamps both limits', async (axis, min, max) => {
  const { store } = await setup()
  store.setter(runResizeDragAtom, { phase: 'start', axis, index: 1, pointerId: 1, position: 0 })
  store.setter(runResizeDragAtom, { phase: 'move', pointerId: 1, position: -10_000 })
  expect(store.getter(resizeDragAtom)?.pixels).toBe(min)
  store.setter(runResizeDragAtom, { phase: 'move', pointerId: 1, position: 10_000 })
  expect(store.getter(resizeDragAtom)?.pixels).toBe(max)
})

test('native rejection keeps the old geometry and displays feedback without opening the size dialog', async () => {
  const { store, resize } = await setup()
  resize.mockRejectedValueOnce(new Error('Size refused'))
  const before = store.getter(viewportSizeOverridesAtom)
  store.setter(runResizeDragAtom, {
    phase: 'start',
    axis: 'row',
    index: 1,
    pointerId: 1,
    position: 0,
  })
  store.setter(runResizeDragAtom, { phase: 'move', pointerId: 1, position: 30 })
  expect(await store.setter(runResizeDragAtom, { phase: 'commit', pointerId: 1 })).toBe(false)
  expect(store.getter(viewportSizeOverridesAtom)).toBe(before)
  expect(store.getter(selectionSizePanelAtom)).toMatchObject({
    target: null,
    busy: false,
    error: 'Size refused',
  })
})
