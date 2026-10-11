import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import { initializeWorkbook } from '../src/rust-workbook/initialize-workbook'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }
const rule = { kind: 'list' as const, items: ['Ready', '001'], ignoreBlank: true }
const projection = { kind: 'visible-window', sheetId: 's', window: range, requestId: 1 }
async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', { addEventListener: (_: string, callback: typeof receive) => {
    receive = callback
  }, postMessage: post })
  const write = vi.fn()
  const read = vi.fn(() => rule)
  const display = vi.fn(() => ({ cellStyles: [], rowStyles: [], columnStyles: [] }))
  class Native {
    rename_sheet() { return true }
    sheet_name() { return 'Sheet' }
    setDataValidation = write
    getDataValidation = read
    history_state = () => ({ undoCount: 1, redoCount: 0 })
    snapshot_format_range = display
    read_sparse_range = () => []
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: Native })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', {
    sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  return { call, write, read, display }
}

test('active-cell read delegates once without reading a projection', async () => {
  const { call, read, write, display } = await setup()
  expect(await call('validation.read', { sheetId: 's', row: 2, col: 0 })).toMatchObject({
    ok: true, result: rule })
  expect(read).toHaveBeenCalledWith(0, 2, 0)
  expect(read).toHaveBeenCalledTimes(1)
  expect(display).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
})

test.each([rule, null])('set/clear delegates one native write and returns one projection', async (value) => {
  const { call, write, display } = await setup()
  expect(await call('validation.change', { sheetId: 's', range, rule: value, projection })).toMatchObject({
    ok: true, result: { projection: { revision: 1, history: { undoCount: 1 } } } })
  expect(write).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledWith(0, 1, 0, 3, 0, value)
  expect(display).toHaveBeenCalledTimes(1)
})

test('bad target and Rust errors do not publish a projection or advance revision', async () => {
  const { call, write, display } = await setup()
  const input = { sheetId: 's', range, rule, projection }
  for (const patch of [{ sheetId: 'missing' }, { range: { ...range, rowEnd: 100 } },
    { range: { ...range, colEnd: -1 } }, { projection: { ...projection, sheetId: 'other' } }]) {
    expect((await call('validation.change', { ...input, ...patch })).ok).toBe(false)
  }
  expect(write).not.toHaveBeenCalled()
  write.mockImplementationOnce(() => { throw new Error('Invalid rule') })
  expect((await call('validation.change', input)).error.message).toBe('Invalid rule')
  expect(display).not.toHaveBeenCalled()
  expect((await call('validation.change', input)).result.projection.revision).toBe(1)
})

test('startup retains an immutable copy of rules and clears initialization history', () => {
  const entry = { range: { ...range }, rule: { ...rule, items: [...rule.items] } }
  const definition = { title: 'Book', sheets: [{ id: 's', name: 'Sheet', rowCount: 100,
    colCount: 8, dataValidations: [entry] }], createImportChunks: () => [] }
  const snapshot = snapshotRustWorkbookDefinition(definition)
  entry.rule.items[0] = 'Changed'
  entry.range.rowEnd = 100
  expect(snapshot.sheets[0].dataValidations).toEqual([{ range, rule }])
  expect(Object.isFrozen(snapshot.sheets[0].dataValidations![0].rule)).toBe(true)
  expect(() => snapshotRustWorkbookDefinition(definition)).toThrow('initial data-validation range')
  const write = vi.fn()
  const clear = vi.fn()
  class Native {
    rename_sheet() {}
    sheet_name() { return 'Sheet' }
    setDataValidation = write
    history_clear = clear
  }
  initializeWorkbook({ WasmWorkbook: Native } as unknown as RustWasmModule, snapshot.sheets)
  expect(write).toHaveBeenCalledWith(0, 1, 0, 3, 0, rule)
  expect(clear).toHaveBeenCalledTimes(1)
  expect(write.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder[0])
})
