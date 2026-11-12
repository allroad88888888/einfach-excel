import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, configureFillSeriesAtom as run, dragFillHandleAtom,
  runVisibleProjectionAtom, selectCellAtom, setSelectionBoundsAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest } from '../src'
import { fillRange } from '../src/rust-workbook/fill-io'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

async function setup() {
  type Input = RustWorkbookCommands['range.fill']['payload']
  const fill = vi.fn(async (p: Input): Promise<RustWorkbookCommands['range.fill']['result']> => ({
    acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 1 },
    projection: { ...p.projection, cells: [], revision: 1 },
    sizes: { rowHeights: [], colWidths: [] },
  }))
  const { store } = createSpreadsheetUi({ connection: {
    request: (async (cmd: string, p: unknown) => cmd === 'range.fill' ? fill(p as Input)
      : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 0 }
    ) as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 3 } })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 7 } })
  await store.setter(run, 'open')
  await store.setter(run, { field: 'listName', value: 'Priority' })
  await store.setter(run, { field: 'listText', value: 'Low\nMedium\nHigh' })
  await store.setter(run, 'save-list')
  await store.setter(run, 'close')
  const drag = (action: Parameters<typeof dragFillHandleAtom.write>[2]) =>
    store.setter(dragFillHandleAtom, action)
  return { store, fill, drag }
}

test.each([false, true])('actual drag command carries metadata only for automatic mode, copy=%s', async copy => {
  const { fill, drag } = await setup()
  await drag({ type: 'start', copy })
  await drag({ type: 'move', coord: { row: 6, col: 3 } })
  expect(fill).not.toHaveBeenCalled()
  await drag({ type: 'finish', copy })
  expect(fill).toHaveBeenCalledTimes(1)
  const request = fill.mock.lastCall![0].request
  if (copy) expect(request).not.toHaveProperty('namedLists')
  else expect(request.namedLists).toContainEqual({ kind: 'custom-list', listName: 'user:Priority',
    values: ['Low', 'Medium', 'High'], locale: 'en' })
  expect(request).not.toHaveProperty('series')
  expect(request).not.toHaveProperty('cells')
})

test('cancel has no RPC; double-click reads the same saved catalog', async () => {
  const { fill, drag } = await setup()
  await drag({ type: 'start', copy: false })
  await drag({ type: 'move', coord: { row: 6, col: 3 } })
  await drag({ type: 'cancel' })
  expect(fill).not.toHaveBeenCalled()
  await drag({ type: 'extend-down', copy: false })
  expect(fill.mock.lastCall![0].request).toMatchObject({ auto: true, adjacent: { rowLimit: 100 },
    namedLists: expect.arrayContaining([expect.objectContaining({ listName: 'user:Priority' })]) })
})

test('transport validates metadata before history, keeps explicit custom locale, and copy omits catalog', () => {
  const apply_auto_fill = vi.fn((_input: Parameters<NonNullable<WasmWorkbook['apply_auto_fill']>>[0]) => ({ written: 1, writeRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 } }))
  const history_begin = vi.fn()
  const workbook = { apply_auto_fill, history_begin, history_finish: vi.fn(),
    snapshot_viewport_sizes: vi.fn() } as unknown as WasmWorkbook
  const input = { sheetId: 's', requestId: 1, direction: 'down' as const,
    range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 } }
  const namedLists = [{ kind: 'custom-list' as const, listName: 'user:Priority', locale: 'tr', values: ['I', 'i'] }]
  fillRange(workbook, 0, { ...input, auto: true, namedLists })
  expect(apply_auto_fill.mock.lastCall![0]).toMatchObject({ infer: true, namedLists })
  fillRange(workbook, 0, { ...input, series: { kind: 'custom-list', sourceCount: 1,
    customValues: ['I', 'i'], customLocale: 'tr' } })
  expect(apply_auto_fill.mock.lastCall![0]).toMatchObject({ list: { locale: 'tr', values: ['I', 'i'] } })
  fillRange(workbook, 0, { ...input, auto: false, namedLists })
  expect(apply_auto_fill.mock.lastCall![0]).not.toHaveProperty('namedLists')
  history_begin.mockClear()
  expect(() => fillRange(workbook, 0, { ...input, auto: true,
    namedLists: [{ ...namedLists[0], values: ['I', 'ı'] }] })).toThrow('candidates')
  expect(history_begin).not.toHaveBeenCalled()
  expect(() => fillRange(workbook, 0, { ...input, series: { kind: 'custom-list', sourceCount: 1,
    customValues: ['Low', 'low'] } })).toThrow('unique')
  expect(history_begin).not.toHaveBeenCalled()
})
