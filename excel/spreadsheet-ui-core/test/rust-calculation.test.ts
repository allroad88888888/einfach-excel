import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { EmptyAsyncFormulaWorkbook } from './next-version-integration/empty-async-workbook'

afterEach(() => vi.unstubAllGlobals())
async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    location: { origin: 'http://localhost' }, addEventListener: (_: string, callback: typeof receive) => { receive = callback }, postMessage: post })
  const recalculate = vi.fn(() => 3)
  const read = vi.fn(() => [])
  const begin = vi.fn()
  class TestWorkbook extends EmptyAsyncFormulaWorkbook {
    rename_sheet() { return true }
    sheet_name() { return 'Orders' }
    recalculate = recalculate
    read_sparse_range = read
    history_begin = begin
    snapshot_format_range = () => ({ cellStyles: [], rowStyles: [], columnStyles: [] })
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 's', name: 'Orders', rowCount: 100, colCount: 8 }] })
  return { call, recalculate, read, begin }
}
const projection = { kind: 'visible-window', sheetId: 's', requestId: 1,
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } }
test.each(['sheet', 'workbook'])('%s uses native recalculation, advances projection revision and creates no history', async (scope) => {
  const { call, recalculate, begin, read } = await runtime()
  expect(await call('formula.recalculate', { scope, projection })).toMatchObject({ ok: true,
    result: { formulaCount: 3, projection: { revision: 1, sheetId: 's' } } })
  expect(recalculate).toHaveBeenCalledWith(scope === 'sheet' ? 0 : undefined)
  expect(read).toHaveBeenCalledOnce()
  expect(begin).not.toHaveBeenCalled()
})
test('invalid scope, missing sheet and native failure do not advance revision or create history', async () => {
  const { call, recalculate, begin } = await runtime()
  expect((await call('formula.recalculate', { scope: 'all', projection })).ok).toBe(false)
  expect((await call('formula.recalculate', { scope: 'sheet', projection: { ...projection, sheetId: 'missing' } })).ok).toBe(false)
  expect(recalculate).not.toHaveBeenCalled()
  recalculate.mockImplementationOnce(() => { throw new Error('Native failure') })
  expect((await call('formula.recalculate', { scope: 'sheet', projection })).error.message).toBe('Native failure')
  expect((await call('formula.recalculate', { scope: 'sheet', projection })).result.projection.revision).toBe(1)
  expect(begin).not.toHaveBeenCalled()
})
