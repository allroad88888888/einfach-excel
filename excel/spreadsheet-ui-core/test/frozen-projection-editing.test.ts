import { expect, test, vi } from 'vitest'
import {
  activeCellFormatAtom,
  commitCellEditingAtom,
  createSpreadsheetUi,
  editingDraftAtom,
  editingSessionAtom,
  initializeWorkbookDocumentAtom,
  projectionSnapshotAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  startCellEditingFromProjectionAtom,
  viewportSizeOverridesAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../src'

const window = { rowStart: 100, rowEnd: 110, colStart: 20, colEnd: 25 }
const viewport = { height: 280, width: 600, rowHeight: 28, colWidth: 120 }
async function setup() {
  let value = '=3*7'
  const project = (p: VisibleProjectionRequest): VisibleProjectionResult => ({
    ...p,
    cells: [],
    revision: 1,
    mergedRanges: [],
    freeze: { rows: 2, cols: 1 },
    frozen: {
      height: 84,
      width: 120,
      regions: [
        {
          pane: 'top',
          window: { rowStart: 0, rowEnd: 1, colStart: 20, colEnd: 25 },
          cells: [
            {
              row: 0,
              col: 20,
              displayValue: '21',
              inputText: value,
              valueKind: 'number',
              format: { bold: true },
            },
          ],
          rowHeights: [{ rowIndex: 0, heightPx: 56 }],
          colWidths: [],
        },
      ],
    },
  })
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'cell.setInput') {
      const p = payload as RustWorkbookCommands['cell.setInput']['payload']
      value = p.request.input
      return {
        acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 1 },
        projection: project(p.projection),
      }
    }
    return project((payload as { request: VisibleProjectionRequest }).request)
  })
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', key: '1', index: 0, name: 'Sheet', rowCount: 1000, colCount: 30 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 20 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window,
    viewport,
    reason: 'viewport',
  })
  return { store, request }
}

test('frozen active cell uses original source, effective format and native row height', async () => {
  const r = await setup()
  expect(r.store.getter(activeCellFormatAtom)).toEqual({ bold: true })
  expect(r.store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s).toEqual({ 0: 56 })
  expect(
    r.store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 20 } }),
  ).toBe(true)
  expect(r.store.getter(editingSessionAtom).draft).toBe('=3*7')
  r.store.setter(editingDraftAtom, { draft: '=3*8' })
  expect(await r.store.setter(commitCellEditingAtom)).toBe('completed')
  expect(r.request).toHaveBeenCalledTimes(2)
  expect(r.request.mock.calls[1]).toMatchObject([
    'cell.setInput',
    {
      request: { row: 0, col: 20, input: '=3*8' },
      projection: { window, viewport },
    },
  ])
  expect(r.store.getter(projectionSnapshotAtom).request).toMatchObject({ viewport })
  expect(r.store.getter(editingSessionAtom).status).toBe('idle')
})

test('frozen size defaults replace stale measurements without clearing unrelated rows', async () => {
  const r = await setup()
  const current = r.store.getter(viewportSizeOverridesAtom)
  r.store.setter(viewportSizeOverridesAtom, {
    ...current,
    rowHeightsBySheet: { s: { 0: 56, 50: 80 } },
  })
  r.request.mockImplementationOnce(async (_command, payload) => {
    const p = (payload as { request: VisibleProjectionRequest }).request
    return {
      ...p,
      revision: 2,
      cells: [],
      freeze: { rows: 2, cols: 1 },
      frozen: {
        height: 56,
        width: 120,
        regions: [
          {
            pane: 'top',
            window: { rowStart: 0, rowEnd: 1, colStart: 20, colEnd: 25 },
            cells: [],
            rowHeights: [],
          },
        ],
      },
    }
  })
  await r.store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window,
    viewport,
    reason: 'viewport',
  })
  expect(r.store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s).toEqual({ 50: 80 })
})
