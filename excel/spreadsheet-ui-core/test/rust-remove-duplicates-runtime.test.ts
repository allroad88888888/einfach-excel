import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { NativeRemoveDuplicatesRequest } from '../src/rust-workbook/remove-duplicates-commands'

afterEach(() => vi.unstubAllGlobals())
const input = { sheetId: 'orders', range: { rowStart: 0, colStart: 0, rowEnd: 399, colEnd: 2 },
  columns: [0, 2], hasHeader: true, comparison: 'trimIgnoreCase' }
const projection = { kind: 'visible-window', sheetId: 'orders', requestId: 10,
  window: { rowStart: 0, colStart: 0, rowEnd: 20, colEnd: 7 } }
const apply = { ...input, projection, expectedRevision: 0 }
const report = { scannedRows: 399, removedRows: 200, uniqueRows: 199, excludedRows: 0,
  headers: ['Key', 'Group', 'ID'], sample: [], sampleTruncated: true }
async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', { addEventListener: (_: string, callback: typeof receive) => { receive = callback }, postMessage: post })
  const preview = vi.fn((_request: NativeRemoveDuplicatesRequest) => report)
  const write = vi.fn((_request: NativeRemoveDuplicatesRequest) => report)
  const read = vi.fn(() => [])
  const begin = vi.fn()
  class TestWorkbook {
    rename_sheet() { return true }
    sheet_name() { return 'Orders' }
    preview_remove_duplicates = preview
    remove_duplicates = write
    read_sparse_range = read
    history_begin = begin
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 'orders', name: 'Orders', rowCount: 1000, colCount: 16 }] })
  return { call, preview, write, read, begin }
}

test('preview only forwards full native scope, key columns and comparison settings', async () => {
  const { call, preview, write, read, begin } = await runtime()
  expect(await call('duplicates.preview', input)).toMatchObject({ ok: true, result: { ...report, revision: 0 } })
  expect(preview).toHaveBeenCalledWith({ sheet: 0, range: input.range, columns: [0, 2],
    hasHeader: true, comparison: 'trimIgnoreCase', rowCount: 1000, colCount: 16 })
  expect(write).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})

test('apply is one native transaction and one projection, without JS history', async () => {
  const { call, write, read, begin } = await runtime()
  expect(await call('duplicates.apply', apply)).toMatchObject({ ok: true,
    result: { removedRows: 200, projection: { revision: 1, requestId: 10 } } })
  expect(write).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledTimes(1)
  expect(begin).not.toHaveBeenCalled()
})

test('stale revisions and projection mismatch cannot reach native removal', async () => {
  const { call, write } = await runtime()
  for (const expectedRevision of [-1, undefined, NaN, 1.5, 1])
    expect((await call('duplicates.apply', { ...apply, expectedRevision })).ok).toBe(false)
  expect((await call('duplicates.apply', { ...apply, projection: { ...projection, sheetId: 'wrong' } })).ok).toBe(false)
  expect((await call('duplicates.apply', { ...apply, sheetId: 'missing' })).ok).toBe(false)
  expect(write).not.toHaveBeenCalled()
})

test('native rejection and unique input do not advance revision', async () => {
  const { call, write } = await runtime()
  write.mockImplementationOnce(() => { throw new Error('merged range') })
  expect((await call('duplicates.apply', apply)).ok).toBe(false)
  write.mockReturnValueOnce({ ...report, removedRows: 0 })
  expect((await call('duplicates.apply', apply)).result.projection.revision).toBe(0)
})

test('projection failure after successful mutation still invalidates old previews', async () => {
  const { call, read, write } = await runtime()
  read.mockImplementationOnce(() => { throw new Error('projection unavailable') })
  expect((await call('duplicates.apply', apply)).ok).toBe(false)
  expect((await call('duplicates.preview', input)).result.revision).toBe(1)
  expect((await call('duplicates.apply', apply)).ok).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
})
