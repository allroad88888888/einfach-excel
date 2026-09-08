import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  runFreezeAtom,
  freezeFeedbackAtom,
  projectedFreezeAtom,
  projectionSnapshotAtom,
  setRustWorkbookConnectionAtom,
  startCellEditingFromProjectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

type Input = RustWorkbookCommands['sheet.freeze']['payload']
const viewport = { height: 280, width: 600, rowHeight: 28, colWidth: 120 }
const project = (p: VisibleProjectionRequest) => ({
  ...p,
  revision: 1,
  cells: [],
  freeze: { rows: 0, cols: 0 },
})
const response = (p: Input) => ({
  changed: true,
  projection: { ...project(p.projection), freeze: { rows: p.rows, cols: p.cols } },
})
async function setup(rowCount = 100, colCount = 8) {
  const change = vi.fn(async (p: Input) => response(p))
  const request = vi.fn(async (command: string, payload: unknown) =>
    command === 'sheet.freeze'
      ? change(payload as Input)
      : project((payload as { request: VisibleProjectionRequest }).request),
  )
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', key: '1', index: 0, name: 'Sheet', rowCount, colCount }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 1 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 3 },
    viewport,
    reason: 'viewport',
  })
  return { store, change, request }
}

test.each([
  ['first-row', 1, 0],
  ['first-column', 0, 1],
  ['selection', 2, 1],
  ['unfreeze', 0, 0],
] as const)(
  '%s sends one native mutation and directly publishes its result',
  async (action, rows, cols) => {
    const r = await setup()
    expect(await r.store.setter(runFreezeAtom, action)).toBe(true)
    expect(r.change).toHaveBeenCalledTimes(1)
    expect(r.change.mock.calls[0][0]).toMatchObject({
      sheetId: 's',
      rows,
      cols,
      projection: { viewport },
    })
    expect(r.request).toHaveBeenCalledTimes(2)
    expect(r.store.getter(projectedFreezeAtom)).toMatchObject({ sheetId: 's', rows, cols })
    expect(r.store.getter(freezeFeedbackAtom)).toEqual({ busy: false, error: null })
  },
)

test('failure or a mismatched native result preserves the previous projection', async () => {
  const r = await setup()
  const before = r.store.getter(projectionSnapshotAtom)
  r.change.mockRejectedValueOnce(new Error('Native freeze failed'))
  expect(await r.store.setter(runFreezeAtom, 'first-row')).toBe(false)
  expect(r.store.getter(projectionSnapshotAtom)).toBe(before)
  expect(r.store.getter(freezeFeedbackAtom).error).toBe('Native freeze failed')
  r.change.mockImplementationOnce(async (p) => ({
    ...response(p),
    projection: { ...response(p).projection, sheetId: 'other' },
  }))
  expect(await r.store.setter(runFreezeAtom, 'first-row')).toBe(false)
  expect(r.store.getter(projectionSnapshotAtom)).toBe(before)
})

test('duplicate operations are blocked and a disposed workbook cannot publish a late result', async () => {
  const r = await setup()
  let finish!: (result: ReturnType<typeof response>) => void
  r.change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = r.store.setter(runFreezeAtom, 'first-row')
  await Promise.resolve()
  expect(r.store.getter(freezeFeedbackAtom).busy).toBe(true)
  expect(await r.store.setter(runFreezeAtom, 'first-column')).toBe(false)
  r.store.setter(setRustWorkbookConnectionAtom, null)
  finish(response(r.change.mock.calls[0][0]))
  expect(await pending).toBe(false)
  expect(r.store.getter(freezeFeedbackAtom).busy).toBe(false)
})

test('editing, single-axis canvas limits and unknown menu actions never freeze', async () => {
  const r = await setup(1, 1)
  expect(await r.store.setter(runFreezeAtom, 'first-row')).toBe(false)
  expect(await r.store.setter(runFreezeAtom, 'first-column')).toBe(false)
  expect(await r.store.setter(runFreezeAtom, 'unknown' as never)).toBe(false)
  expect(r.change).not.toHaveBeenCalled()
  r.store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } })
  expect(await r.store.setter(runFreezeAtom, 'unfreeze')).toBe(false)
})
