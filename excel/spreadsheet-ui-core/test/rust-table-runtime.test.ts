import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { validNativeTables, type NativeTableAction } from '../src/tables/native-types'

afterEach(() => vi.unstubAllGlobals())
const projection = { kind: 'visible-window', sheetId: 's', requestId: 2,
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } } as const
const input = { sheetId: 's', revision: 0, projection, action: {
  kind: 'create', name: 'Sales', range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 1 },
} } as const
const tables = [{ name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B4',
  hasHeaders: true, hasTotals: false, columns: ['Product', 'Amount'] }]
async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn(), read = vi.fn(() => []), begin = vi.fn()
  const bulk = vi.fn(() => ({ accepted: 0, errors: 0, rejectedFormulas: 0 }))
  const clear = vi.fn()
  const write = vi.fn()
  const change = vi.fn((_sheet: number, _action: NativeTableAction) => true)
  const list = vi.fn(() => tables)
  vi.stubGlobal('self', { addEventListener: (_: string, fn: typeof receive) => { receive = fn },
    postMessage: post })
  class TestWorkbook {
    rename_sheet() { return true }
    add_sheet() { return 1 }
    sheet_name() { return 'Sheet' }
    change_table = change
    listTables = list
    history_begin = begin
    history_clear = clear
    set_cell_input = write
    bulk_import_cells = bulk
    read_sparse_range = read
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
    set_format_range() {}
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8 }] })
  return { call, change, read, begin, list, bulk, clear, write }
}
test('creation uses one native history command and one returned projection', async () => {
  const { call, change, read, begin, list } = await setup()
  expect(await call('table.change', input)).toMatchObject({ ok: true,
    result: { changed: true, projection: { tables, revision: 1 } } })
  expect(change).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledWith(0, { kind: 'create', name: 'Sales', range: [0, 0, 3, 1] })
  expect(read).toHaveBeenCalledTimes(1)
  expect(list).toHaveBeenCalledTimes(1)
  expect(begin).not.toHaveBeenCalled()
})
test('resize maps only coordinates and returns the same native mutation projection', async () => {
  const { call, change, read, begin, list } = await setup()
  const range = { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 2 }
  list.mockReturnValueOnce([{ ...tables[0], range: 'A1:C6', columns: ['Product', 'Amount', 'Column1'] }])
  expect(await call('table.change', { ...input, action: { kind: 'resize', name: 'Sales', range } }))
    .toMatchObject({ ok: true, result: { projection: { revision: 1,
      tables: [{ range: 'A1:C6', columns: ['Product', 'Amount', 'Column1'] }] } } })
  expect(change).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledWith(0, { kind: 'resize', name: 'Sales', range: [0, 0, 5, 2] })
  expect(read).toHaveBeenCalledTimes(1)
  expect(begin).not.toHaveBeenCalled()
  expect((await call('table.change', { ...input, revision: 1,
    action: { kind: 'resize', name: 'Sales', range: { ...range, colEnd: 8 } } })).ok).toBe(false)
  expect(change).toHaveBeenCalledTimes(1)
})
test.each([
  { kind: 'style', name: 'Sales', style: { preset: 'green', bandedRows: false, firstColumn: true } },
  { kind: 'rename', name: 'Sales', newName: 'Revenue' },
  { kind: 'rename-column', name: 'Sales', column: 'Amount', newName: 'Revenue [net]' },
  { kind: 'convert-to-range', name: 'Sales' },
  { kind: 'total-function', name: 'Sales', column: 'Amount', function: 'average' },
])('forwards $kind without emulating cell or registry writes', async (action) => {
  const { call, change } = await setup()
  expect((await call('table.change', { ...input, action })).ok).toBe(true)
  expect(change).toHaveBeenCalledWith(0, action)
})
test('totals row forwards the native canvas bound and returns one authoritative projection', async () => {
  const { call, change, read } = await setup()
  expect((await call('table.change', { ...input,
    action: { kind: 'totals-row', name: 'Sales', enabled: true } })).ok).toBe(true)
  expect(change).toHaveBeenCalledWith(0, { kind: 'totals-row', name: 'Sales', enabled: true, rowCount: 100 })
  expect(read).toHaveBeenCalledTimes(1)
})
test('rejects stale, foreign, out-of-bounds and malformed requests before native mutation', async () => {
  const { call, change } = await setup()
  for (const bad of [
    { ...input, revision: 1 }, { ...input, sheetId: 'other' },
    { ...input, projection: { ...projection, window: { ...projection.window, rowEnd: -1 } } },
    { ...input, action: { ...input.action, range: { ...input.action.range, rowEnd: 100 } } },
    { ...input, action: { kind: 'delete', name: 'Sales' } },
  ]) expect((await call('table.change', bad)).ok).toBe(false)
  expect(change).not.toHaveBeenCalled()
})
test('native errors and no-ops preserve revision; normal reads include the registry', async () => {
  const { call, change } = await setup()
  change.mockImplementationOnce(() => { throw new Error('Table name conflict') })
  expect((await call('table.change', input)).error.message).toMatch(/conflict/)
  change.mockReturnValueOnce(false)
  expect((await call('table.change', input)).result.projection.revision).toBe(0)
  expect((await call('projection.readVisible', { request: projection })).result.tables).toEqual(tables)
  expect((await call('table.change', input)).result.projection.revision).toBe(1)
})
test('table projection validation rejects malformed coordinates and column lists', () => {
  expect(validNativeTables(tables)).toBe(true)
  for (const patch of [{ range: 'A0:B2' }, { columns: ['Product'] },
    { sheetIndex: -1 }, { columns: [1, 2] }, { hasHeaders: null },
    { style: null }, { style: { preset: 'pink', bandedRows: true, firstColumn: false } },
    { style: { preset: 'blue', bandedRows: 1, firstColumn: false } },
    { hasTotals: true, totalFunctions: ['sum'] }, { hasTotals: true, totalFunctions: ['sum', 'fake'] }])
    expect(validNativeTables([{ ...tables[0], ...patch }])).toBe(false)
})

test('seed totals are established after the table and before startup history is cleared', async () => {
  const { call, change, clear } = await setup()
  expect((await call('workbook.importCells', { cells: [], tables: [
    { sheetId: 's', name: 'Sales', range: input.action.range, totals: true,
      style: { preset: 'blue', bandedRows: true, firstColumn: false } },
  ] })).ok).toBe(true)
  expect(change.mock.calls.map((entry) => entry[1].kind)).toEqual(['create', 'totals-row', 'style'])
  expect(change.mock.calls[1][1]).toEqual({ kind: 'totals-row', name: 'Sales', enabled: true, rowCount: 100 })
  expect(change.mock.invocationCallOrder[2]).toBeLessThan(clear.mock.invocationCallOrder.at(-1)!)
})
test('initial tables are built after imported cells and before clearing startup history', async () => {
  const { call, bulk, change, clear } = await setup()
  expect((await call('workbook.importCells', { cells: [], tables: [
    { sheetId: 's', name: 'Sales', range: input.action.range },
  ] })).ok).toBe(true)
  expect(change).toHaveBeenCalledWith(0, { kind: 'create', name: 'Sales', range: [0, 0, 3, 1] })
  expect(bulk.mock.invocationCallOrder[0]).toBeLessThan(change.mock.invocationCallOrder[0])
  expect(change.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder.at(-1)!)
})

test('seed calculated columns use one native input after table creation and before clearing history',
  async () => {
    const { call, change, write, clear } = await setup()
    expect((await call('workbook.importCells', { cells: [], tables: [{
      sheetId: 's', name: 'Sales', range: input.action.range,
      calculatedColumns: [null, '=[@Product]*2'],
    }] })).ok).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(0, 'B2', '=[@Product]*2')
    expect(change.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0])
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder.at(-1)!)
  })

test('import passes sparse formats with the values in one native call', async () => {
  const { call, bulk } = await setup()
  const cells = [
    { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Header', format: { bold: true } },
    { sheet: 0, row: 5, col: 1, kind: 'text', value: 'Double',
      format: { borders: { bottom: { style: 'double', color: '#c00000' } } } },
  ]
  // 此假件不提供 patch_format_range：格式必须跟随 bulk_import_cells，不二次写入。
  expect((await call('workbook.importCells', { cells })).ok).toBe(true)
  expect(bulk).toHaveBeenCalledTimes(1)
  expect(bulk).toHaveBeenCalledWith(cells)
})
