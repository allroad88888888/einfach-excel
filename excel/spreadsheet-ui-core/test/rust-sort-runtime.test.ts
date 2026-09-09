import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

afterEach(() => vi.unstubAllGlobals())
async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => { receive = fn }, postMessage: post,
  })
  const sort = vi.fn<(...args: unknown[]) => {
    ok: boolean; movedRows?: number; code?: string
  }>(() => ({ ok: true, movedRows: 4 }))
  const begin = vi.fn(), finish = vi.fn()
  class TestWorkbook {
    rename_sheet() { return true }
    sheet_name() { return 'Orders' }
    sortRange = sort
    history_begin = begin
    history_finish = finish
    read_sparse_range() { return [] }
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 's', name: 'Orders' }] })
  return { call, sort, begin, finish }
}
const range = { rowStart: 10, rowEnd: 20, colStart: 1, colEnd: 3 }
const projection = { kind: 'visible-window', sheetId: 's', requestId: 8,
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 } }
const input = { sheetId: 's', range, keys: [{ col: 1, direction: 'asc' }], hasHeader: false, projection }

test.each([false, true])('header=%s, one native sort and history group, one projection', async (hasHeader) => {
  const { call, sort, begin, finish } = await runtime()
  const keys = [{ col: 1, direction: 'asc' }, { col: 2, direction: 'desc' }]
  expect(await call('range.sort', { ...input, keys, hasHeader })).toMatchObject({ ok: true, result: {
    movedRows: 4, projection: { sheetId: 's', requestId: 8, revision: 1 },
  } })
  expect(sort).toHaveBeenCalledTimes(1)
  expect(sort).toHaveBeenCalledWith(0, {
    range: { startRow: hasHeader ? 11 : 10, endRow: 20, startCol: 1, endCol: 3 },
    keys: keys.map((key) => ({ ...key, caseSensitive: false })), excludedRows: [],
  })
  expect(begin).toHaveBeenCalledTimes(1)
  expect(begin).toHaveBeenCalledWith(0, hasHeader ? 11 : 10, 1, 20, 3, 'Sort selection', true)
  expect(finish).toHaveBeenCalledTimes(1)
  expect(finish).toHaveBeenCalledWith(true)
})

test('invalid range, mismatched sheet and duplicate/out-of-range keys reject before history', async () => {
  const { call, sort, begin } = await runtime()
  const invalid = [
    { range: {} },
    { range: { ...range, rowStart: -1 } }, { range: { ...range, rowEnd: 10 } },
    { range: { ...range, rowEnd: 1_048_576 } }, { range: { ...range, colEnd: 16_384 } },
    { range: { ...range, rowEnd: 1.5 } }, { range: { ...range, rowEnd: 500_000 } },
    { range: { ...range, rowEnd: 11 }, hasHeader: true },
    { keys: [] }, { keys: [{ col: 0, direction: 'asc' }] },
    { keys: [{ col: 1, direction: 'bad' }] }, { keys: [input.keys[0], input.keys[0]] },
    { projection: { ...projection, sheetId: 'other' } },
  ]
  for (const patch of invalid) expect((await call('range.sort', { ...input, ...patch })).ok).toBe(false)
  expect(sort).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})

test.each(['merge-in-range', 'spill-in-range'])('%s cancels history and leaves revision unchanged', async (code) => {
  const { call, sort, finish } = await runtime()
  sort.mockReturnValueOnce({ ok: false, code })
  expect((await call('range.sort', input)).ok).toBe(false)
  expect(finish).toHaveBeenLastCalledWith(false)
  expect((await call('projection.readVisible', { request: projection })).result.revision).toBe(0)
  expect((await call('range.sort', input)).ok).toBe(true)
  expect(finish).toHaveBeenLastCalledWith(true)
})

test('already sorted data returns a current projection without inventing a mutation revision', async () => {
  const { call, sort } = await runtime()
  sort.mockReturnValueOnce({ ok: true, movedRows: 0 })
  expect(await call('range.sort', input)).toMatchObject({ ok: true, result: {
    movedRows: 0, projection: { revision: 0 },
  } })
})
