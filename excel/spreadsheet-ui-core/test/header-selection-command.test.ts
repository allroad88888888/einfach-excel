import { describe, expect, test } from 'vitest'
import {
  applySelectionFormatAtom,
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectGridHeaderAtom,
  selectionSnapshotAtom,
  setViewportMetricsAtom,
  viewportMetricsAtom,
  type SetFormatRangeRequest,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const writes: SetFormatRangeRequest[] = []
  const projection = (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const,
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: writes.length,
    window: request.window,
    cells: [],
  })
  const { store } = createSpreadsheetUi({
    connection: createTestRustWorkbookConnection({
      async readVisibleProjection(request) {
        return projection(request)
      },
      async setRangeFormat(request, visibleRequest) {
        writes.push(request)
        return {
          acknowledgement: {
            sheetId: request.sheetId,
            requestId: request.requestId,
            revision: writes.length,
            affectedRange: request.range,
          },
          projection: projection(visibleRequest),
        }
      },
    }),
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Headers',
    sheets: [{ id: 'sheet-1', index: 0, name: 'Sheet 1', rowCount: 100, colCount: 16 }],
  })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom),
    sheetId: 'sheet-1',
    rowCount: 100,
    colCount: 16,
    viewportHeight: 240,
    viewportWidth: 480,
    rowHeight: 24,
    colWidth: 96,
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
  })
  return { store, writes }
}

describe('grid header selection', () => {
  test.each(['row', 'column', 'all'] as const)(
    'selects %s bounds and sends the matching Rust style scope',
    async (kind) => {
      const { store, writes } = await setup()
      const input =
        kind === 'all' ? { kind, sheetId: 'sheet-1' } : { kind, sheetId: 'sheet-1', index: 2 }
      await expect(store.setter(selectGridHeaderAtom, input)).resolves.toBe(true)
      const range = {
        rowStart: kind === 'row' ? 2 : 0,
        rowEnd: kind === 'row' ? 2 : 99,
        colStart: kind === 'column' ? 2 : 0,
        colEnd: kind === 'column' ? 2 : 15,
      }
      expect(store.getter(selectionSnapshotAtom)).toMatchObject({ selection: { kind }, range })
      await expect(store.setter(applySelectionFormatAtom, 'bold')).resolves.toBe('completed')
      expect(writes).toHaveLength(1)
      expect(writes[0]).toMatchObject({
        scope: kind === 'all' ? 'cell' : kind,
        range,
        format: { bold: true },
        writeMode: 'patch',
      })
    },
  )

  test('extends header selections from their original anchor', async () => {
    const { store } = await setup()
    await store.setter(selectGridHeaderAtom, { kind: 'row', sheetId: 'sheet-1', index: 5 })
    await store.setter(selectGridHeaderAtom, {
      kind: 'row',
      sheetId: 'sheet-1',
      index: 2,
      extend: true,
    })
    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 2,
      rowEnd: 5,
      colStart: 0,
      colEnd: 15,
    })
    await store.setter(selectGridHeaderAtom, {
      kind: 'column',
      sheetId: 'sheet-1',
      index: 1,
      extend: true,
    })
    await store.setter(selectGridHeaderAtom, {
      kind: 'column',
      sheetId: 'sheet-1',
      index: 3,
      extend: true,
    })
    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 0,
      rowEnd: 99,
      colStart: 1,
      colEnd: 3,
    })
  })

  test('reveals the active header cell after scrolling', async () => {
    const { store } = await setup()
    store.setter(setViewportMetricsAtom, {
      ...store.getter(viewportMetricsAtom),
      scrollTop: 1200,
      scrollLeft: 480,
    })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      scrollTop: 1200,
      scrollLeft: 480,
      colCount: 16,
    })
    await store.setter(selectGridHeaderAtom, { kind: 'column', sheetId: 'sheet-1', index: 8 })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 8 })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 0, scrollLeft: 480 })
    await store.setter(selectGridHeaderAtom, { kind: 'all', sheetId: 'sheet-1' })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 0, scrollLeft: 0 })
  })

  test('rejects stale sheets and invalid header indices', async () => {
    const { store } = await setup()
    const before = store.getter(selectionSnapshotAtom)
    for (const index of [-1, 0.5, 100, NaN]) {
      await expect(
        store.setter(selectGridHeaderAtom, { kind: 'row', sheetId: 'sheet-1', index }),
      ).resolves.toBe(false)
    }
    await expect(
      store.setter(selectGridHeaderAtom, { kind: 'all', sheetId: 'missing' }),
    ).resolves.toBe(false)
    expect(store.getter(selectionSnapshotAtom)).toBe(before)
  })
})
