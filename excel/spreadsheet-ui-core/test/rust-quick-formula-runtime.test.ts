import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { EmptyAsyncFormulaWorkbook } from './next-version-integration/empty-async-workbook'
import type { NativeQuickFormulaRequest } from '../src/rust-workbook/quick-formula-commands'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }
async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    location: { origin: 'http://localhost' }, addEventListener: (_: string, callback: typeof receive) => { receive = callback }, postMessage: post })
  const suggest = vi.fn((request: NativeQuickFormulaRequest) => ({
    target: { row: 4, col: 0 }, input: `=${request.function.toUpperCase()}(A2:A4)`,
  }))
  const read = vi.fn(() => [])
  const begin = vi.fn()
  class TestWorkbook extends EmptyAsyncFormulaWorkbook {
    rename_sheet() { return true }
    sheet_name() { return 'Orders' }
    suggest_quick_formula = suggest
    read_sparse_range = read
    history_begin = begin
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [
    { id: 'orders', name: 'Orders', rowCount: 1000, colCount: 16 },
  ] })
  return { call, suggest, read, begin }
}

test.each(['sum', 'average', 'count'])('%s forwards scope without writing or scanning', async (fn) => {
  const { call, suggest, read, begin } = await runtime()
  expect(await call('formula.suggest', { sheetId: 'orders', range, function: fn })).toMatchObject({
    ok: true, result: { target: { row: 4, col: 0 }, input: `=${fn.toUpperCase()}(A2:A4)`, revision: 0 },
  })
  expect(suggest).toHaveBeenCalledWith({
    sheet: 0, range, function: fn, rowCount: 1000, colCount: 16,
  })
  expect(read).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
})

test('unknown sheets fail before native and native errors do not advance revision', async () => {
  const { call, suggest } = await runtime()
  const input = { sheetId: 'orders', range, function: 'sum' }
  expect((await call('formula.suggest', { ...input, sheetId: 'missing' })).ok).toBe(false)
  expect(suggest).not.toHaveBeenCalled()
  suggest.mockImplementationOnce(() => { throw new Error('Occupied result') })
  expect((await call('formula.suggest', input)).error.message).toMatch(/Occupied/)
  expect((await call('formula.suggest', input)).result.revision).toBe(0)
})
