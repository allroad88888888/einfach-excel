import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { NativeTextColumnsRequest } from '../src/rust-workbook/text-columns-commands'

afterEach(() => vi.unstubAllGlobals())
const source = { rowStart: 0, colStart: 0, rowEnd: 399, colEnd: 0 }
const target = { rowStart: 0, colStart: 2, rowEnd: 399, colEnd: 3 }
const input = {
  sheetId: 'orders', source, destination: { row: 0, col: 2 },
  mode: { kind: 'delimited', delimiters: [',', '、'], mergeConsecutive: true, qualifier: '"' },
}
const projection = {
  kind: 'visible-window', sheetId: 'orders', requestId: 10,
  window: { rowStart: 0, colStart: 0, rowEnd: 20, colEnd: 7 },
}
const apply = { ...input, projection, expectedRevision: 0, overwrite: false }

async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, callback: typeof receive) => { receive = callback },
    postMessage: post,
  })
  const preview = vi.fn((_request: NativeTextColumnsRequest) => ({
    target, overwrittenCells: 2, sample: [['001', '北京']], sampleTruncated: true,
  }))
  const write = vi.fn((_request: NativeTextColumnsRequest, _overwrite: boolean) => ({
    target, changedCells: 800,
  }))
  const read = vi.fn(() => [])
  const begin = vi.fn()
  class TestWorkbook {
    rename_sheet() { return true }
    sheet_name() { return 'Orders' }
    preview_text_columns = preview
    split_text_columns = write
    read_sparse_range = read
    history_begin = begin
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  expect((await call('workbook.initialize', {
    sheets: [{ id: 'orders', name: 'Orders', rowCount: 1001, colCount: 16 }],
  })).ok).toBe(true)
  return { call, preview, write, read, begin, TestWorkbook }
}

test('preview forwards complete scope and native options, not visible rows or a TS split', async () => {
  const { call, preview, write, read, begin } = await runtime()
  expect(await call('textColumns.preview', input)).toEqual({
    id: 2, ok: true,
    result: { target, overwrittenCells: 2, sample: [['001', '北京']], sampleTruncated: true, revision: 0 },
  })
  expect(preview).toHaveBeenCalledTimes(1)
  expect(preview).toHaveBeenCalledWith({
    sheet: 0, source, destination: input.destination, mode: input.mode,
    rowCount: 1001, colCount: 16,
  })
  expect(write).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})

test('apply passes overwrite once, publishes one projection and leaves history to Rust', async () => {
  const { call, preview, write, read, begin } = await runtime()
  expect(await call('textColumns.apply', { ...apply, overwrite: true })).toMatchObject({
    ok: true, result: { target, changedCells: 800, projection: { revision: 1, requestId: 10 } },
  })
  expect(write).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledWith({
    sheet: 0, source, destination: input.destination, mode: input.mode,
    rowCount: 1001, colCount: 16,
  }, true)
  expect(read).toHaveBeenCalledTimes(1)
  expect(preview).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
  expect((await call('textColumns.preview', input)).result.revision).toBe(1)
})

test('fixed-width mode is forwarded unchanged to both commands', async () => {
  const { call, preview, write } = await runtime()
  const mode = { kind: 'fixedWidth', breakpoints: [2, 5] }
  await call('textColumns.preview', { ...input, mode })
  await call('textColumns.apply', { ...apply, mode })
  expect(preview.mock.lastCall![0].mode).toEqual(mode)
  expect(write.mock.lastCall![0].mode).toEqual(mode)
})

test('stale or absent revision cannot reuse a previous overwrite confirmation', async () => {
  const { call, write } = await runtime()
  await call('textColumns.apply', apply)
  write.mockClear()
  for (const expectedRevision of [0, -1, undefined, NaN, 1.5]) {
    expect((await call('textColumns.apply', { ...apply, expectedRevision, overwrite: true })).ok).toBe(false)
  }
  expect(write).not.toHaveBeenCalled()
})

test('unknown sheet and mismatched projection are rejected before mutation', async () => {
  const { call, write, preview } = await runtime()
  expect((await call('textColumns.preview', { ...input, sheetId: 'missing' })).ok).toBe(false)
  expect((await call('textColumns.apply', { ...apply, sheetId: 'missing' })).ok).toBe(false)
  expect((await call('textColumns.apply', {
    ...apply, projection: { ...projection, sheetId: 'missing' },
  })).ok).toBe(false)
  expect(write).not.toHaveBeenCalled()
  expect(preview).not.toHaveBeenCalled()
})

test('native rejection and no-op do not advance revision', async () => {
  const { call, write } = await runtime()
  write.mockImplementationOnce(() => { throw new Error('TEXT_COLUMNS_OVERWRITE_CONFIRMATION_REQUIRED') })
  expect(await call('textColumns.apply', apply)).toMatchObject({
    ok: false, error: { message: 'TEXT_COLUMNS_OVERWRITE_CONFIRMATION_REQUIRED' },
  })
  expect((await call('textColumns.preview', input)).result.revision).toBe(0)
  write.mockReturnValueOnce({ target, changedCells: 0 })
  expect((await call('textColumns.apply', apply)).result.projection.revision).toBe(0)
})

test('projection failure after native success still invalidates old preview', async () => {
  const { call, write, read } = await runtime()
  read.mockImplementationOnce(() => { throw new Error('projection failed') })
  expect((await call('textColumns.apply', apply)).ok).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
  expect((await call('textColumns.preview', input)).result.revision).toBe(1)
  expect((await call('textColumns.apply', apply)).ok).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
})
