import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

afterEach(() => vi.unstubAllGlobals())

async function runtime(preview = vi.fn(() => '02-Jan-00'), available = true) {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  const read = vi.fn(() => [])
  const begin = vi.fn()
  const write = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => { receive = fn }, postMessage: post,
  })
  class TestWorkbook {
    names = ['Orders']
    rename_sheet() { return true }
    sheet_name(index: number) { return this.names[index] }
    add_sheet(name: string) { return this.names.push(name) - 1 }
    preview_number_format = available ? preview : undefined
    read_sparse_range = read
    history_begin = begin
    patch_format_selection = write
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  expect((await call('workbook.initialize', {
    sheets: [{ id: 'orders', name: 'Orders' }, { id: 'summary', name: 'Summary' }],
  })).ok).toBe(true)
  return { call, read, begin, write, preview }
}

const input = { sheetId: 'summary', addr: 'C4', numberFormat: { kind: 'date', pattern: 'dd-mmm-yy' } }

test('preview forwards one native read without a format mutation, history or projection refresh', async () => {
  const { call, read, begin, write, preview } = await runtime()
  expect(await call('format.preview', input)).toMatchObject({ ok: true, result: '02-Jan-00' })
  expect(preview).toHaveBeenCalledTimes(1)
  expect(preview).toHaveBeenCalledWith(1, 'C4', input.numberFormat)
  expect(read).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  const projected = await call('projection.readVisible', { request: {
    kind: 'visible-window', sheetId: 'summary', requestId: 2,
    window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
  } })
  expect(projected).toMatchObject({ ok: true, result: { revision: 0 } })
})

test('blank preview is a valid response and never replaced with a sample number', async () => {
  const { call } = await runtime(vi.fn(() => ''))
  expect(await call('format.preview', input)).toMatchObject({ ok: true, result: '' })
})

test('native errors and unavailable export are returned without JS formatting fallback', async () => {
  const { call, read, write } = await runtime(vi.fn(() => { throw new Error('INVALID_ADDRESS') }))
  expect(await call('format.preview', input)).toMatchObject({ ok: false, error: { message: 'INVALID_ADDRESS' } })
  expect(read).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  const missing = await runtime(undefined, false)
  expect(await missing.call('format.preview', input)).toMatchObject({
    ok: false, error: { message: 'Rust number format preview is unavailable.' },
  })
})

test('unknown workbook sheet is rejected before calling native preview', async () => {
  const { call, preview } = await runtime()
  expect(await call('format.preview', { ...input, sheetId: 'missing' })).toMatchObject({
    ok: false, error: { code: 'INVALID_SHEET' },
  })
  expect(preview).not.toHaveBeenCalled()
})
