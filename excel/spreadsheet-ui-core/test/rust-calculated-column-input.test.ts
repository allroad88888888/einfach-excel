import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustCellSnapshot } from '../src/rust-workbook/wasm-types'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'

afterEach(() => vi.unstubAllGlobals())
const projection = { kind: 'visible-window', sheetId: 's', requestId: 2,
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 3 } } as const
const table = { name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B4',
  hasHeaders: true, hasTotals: false, columns: ['Amount', 'Total'] }

async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn(), write = vi.fn(), begin = vi.fn()
  const read = vi.fn<() => RustCellSnapshot[]>(() => [])
  const list = vi.fn(() => [table])
  vi.stubGlobal('self', { addEventListener: (_: string, fn: typeof receive) => { receive = fn },
    postMessage: post })
  class TestWorkbook {
    rename_sheet() { return true }
    add_sheet() { return 1 }
    sheet_name() { return 'Sheet' }
    set_cell_input = write
    history_begin = begin
    read_sparse_range = read
    listTables = list
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
    set_format_range() {}
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8 }] })
  return { call, write, begin, read, list }
}

test.each([
  { name: 'create', row: 2, col: 1, address: 'B3', input: '=[@Amount]*2',
    range: 'A1:B4', results: [['B2', '2'], ['B3', '4'], ['B4', '6']] },
  { name: 'update', row: 1, col: 1, address: 'B2', input: '=[@Amount]*3',
    range: 'A1:B4', results: [['B2', '3'], ['B3', '6'], ['B4', '9']] },
  { name: 'inherit', row: 4, col: 0, address: 'A5', input: '4',
    range: 'A1:B5', results: [['A5', '4'], ['B5', '8']] },
])('$name returns all native calculated cells after one input write', async (scenario) => {
  const { call, write, begin, read, list } = await setup()
  // 固定原生响应，仅验证传输与投影；不在 TS 假件里计算或填充公式。
  read.mockReturnValue(scenario.results.map(([addr, display]) => ({
    sheet: 0, addr, display, type: 'number', isError: false,
    formula: addr.startsWith('B') ? (scenario.col === 1 ? scenario.input : '=[@Amount]*2') : '',
  })))
  list.mockReturnValue([{ ...table, range: scenario.range }])
  const response = await call('cell.setInput', { projection, request: {
    sheetId: 's', requestId: 1, row: scenario.row, col: scenario.col, input: scenario.input,
  } })
  expect(response).toMatchObject({ ok: true, result: {
    acknowledgement: { sheetId: 's', requestId: 1, revision: 1 },
    projection: { revision: 1, tables: [{ range: scenario.range }] },
  } })
  const values = response.result.projection.cells.map(
    (cell: { displayValue: string }) => cell.displayValue)
  expect(values)
    .toEqual(scenario.results.map(([, value]) => value))
  expect(write).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledWith(0, scenario.address, scenario.input)
  expect(read).toHaveBeenCalledTimes(1)
  expect(list).toHaveBeenCalledTimes(1)
  expect(begin).not.toHaveBeenCalled()
})

test('rejected calculated input publishes no projection and leaves the revision unchanged', async () => {
  const { call, write, read, list, begin } = await setup()
  write.mockImplementationOnce(() => { throw new Error('FORMULA_CYCLE') })
  const payload = { projection, request: {
    sheetId: 's', requestId: 1, row: 2, col: 1, input: '=B3+1',
  } }
  expect(await call('cell.setInput', payload)).toMatchObject({
    ok: false, error: { message: 'FORMULA_CYCLE' },
  })
  expect(write).toHaveBeenCalledTimes(1)
  expect(read).not.toHaveBeenCalled()
  expect(list).not.toHaveBeenCalled()
  expect(begin).not.toHaveBeenCalled()
  expect((await call('projection.readVisible', { request: projection })).result.revision).toBe(0)
  expect((await call('cell.setInput', { ...payload,
    request: { ...payload.request, requestId: 3, input: '=[@Amount]*2' },
  })).result.projection.revision).toBe(1)
  expect(write).toHaveBeenCalledTimes(2)
})

test('initial calculated columns are validated and snapshotted before runtime startup', () => {
  const calculatedColumns: (string | null)[] = [null, '=[@Amount]*2']
  const definition = { title: 'Demo', createImportChunks: () => [], sheets: [{
    id: 's', name: 'Sheet', rowCount: 100, colCount: 8,
    tables: [{ name: 'Sales', range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 1 },
      calculatedColumns }],
  }] }
  const snapshot = snapshotRustWorkbookDefinition(definition)
  calculatedColumns[1] = '=99'
  expect(snapshot.sheets[0].tables![0].calculatedColumns).toEqual([null, '=[@Amount]*2'])
  expect(Object.isFrozen(snapshot.sheets[0].tables![0].calculatedColumns)).toBe(true)
  for (const invalid of [[null], [null, 'plain text'], [null, 2]]) {
    definition.sheets[0].tables[0].calculatedColumns = invalid as (string | null)[]
    expect(() => snapshotRustWorkbookDefinition(definition)).toThrow('Invalid initial calculated')
  }
})
