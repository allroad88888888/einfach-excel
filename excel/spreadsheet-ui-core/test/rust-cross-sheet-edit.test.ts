import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { EmptyAsyncFormulaWorkbook } from './next-version-integration/empty-async-workbook'

afterEach(() => vi.unstubAllGlobals())

async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    location: { origin: 'http://localhost' },
    addEventListener: (_: string, fn: typeof receive) => { receive = fn },
    postMessage: post,
  })
  const write = vi.fn()
  const begin = vi.fn()
  const finish = vi.fn()
  const read = vi.fn(() => [])
  class TestWorkbook extends EmptyAsyncFormulaWorkbook {
    rename_sheet() { return true }
    add_sheet() { return 1 }
    sheet_name(index: number) { return index === 0 ? 'Orders' : 'Summary' }
    set_cell_input = write
    history_begin = begin
    history_finish = finish
    read_sparse_range = read
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', {
    sheets: [{ id: 'orders', name: 'Orders' }, { id: 'summary', name: 'Summary' }],
  })
  return { call, write, begin, finish, read }
}

const request = {
  kind: 'set-cell-input', sheetId: 'orders', requestId: 8,
  row: 500, col: 10, input: "='Summary'!B1",
}
const projection = {
  kind: 'visible-window', sheetId: 'summary', requestId: 8,
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
}

test('one cell command writes/history-tracks source sheet and returns browsing sheet projection', async () => {
  const { call, write, begin, finish, read } = await runtime()
  const response = await call('cell.setInput', { request, projection })
  expect(write.mock.calls).toEqual([[0, 'K501', "='Summary'!B1"]])
  expect(begin).not.toHaveBeenCalled()
  expect(finish).not.toHaveBeenCalled()
  expect(read.mock.calls).toEqual([[1, 0, 0, 9, 7]])
  expect(response).toMatchObject({ ok: true, result: {
    acknowledgement: { sheetId: 'orders', requestId: 8, revision: 1 },
    projection: { sheetId: 'summary', requestId: 8, revision: 1 },
  } })
})

test('missing source or projection sheet is rejected before any write or history record', async () => {
  const { call, write, begin } = await runtime()
  expect((await call('cell.setInput', {
    request, projection: { ...projection, sheetId: 'missing' },
  })).ok).toBe(false)
  expect((await call('cell.setInput', {
    request: { ...request, sheetId: 'missing' }, projection,
  })).ok).toBe(false)
  expect(write).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})

test('the cross-sheet projection exception does not extend to other mutations', async () => {
  const { call, write, begin } = await runtime()
  for (const command of ['format.setRange', 'range.clear', 'range.fill', 'clipboard.paste']) {
    expect(await call(command, { request, projection })).toMatchObject({
      ok: false, error: { code: 'PROJECTION_SHEET_MISMATCH' },
    })
  }
  expect(write).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})
