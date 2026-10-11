import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { startRustWorkbookRuntimeAtom, spreadsheetRuntimeAtom,
  disposeRustWorkbookRuntimeAtom, type RustWorkbookDefinition } from '../src'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import type { WorkerLike } from '../src/rust-worker'
import { TEST_FUNCTION_CATALOG } from './support/function-catalog'

function definition() {
  return { title: 'Book', sheets: [{ id: 's', name: 'Sheet', rowCount: 10, colCount: 2,
    tables: [{ name: 'Sales', range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 1 }, totals: true,
      filterRules: [{ kind: 'list' as const, colIndex: 0, values: ['Keyboard'] }],
      style: { preset: 'blue' as const, bandedRows: true, firstColumn: false } }],
  }], createImportChunks: () => [] }
}
test('initial tables are frozen independently of the caller and bounded by the canvas', () => {
  const source = definition()
  const copied = snapshotRustWorkbookDefinition(source)
  source.sheets[0].tables[0].range.rowEnd = 10
  expect(copied.sheets[0].tables![0].range.rowEnd).toBe(3)
  expect(Object.isFrozen(copied.sheets[0].tables![0].range)).toBe(true)
  expect(copied.sheets[0].tables![0].totals).toBe(true)
  source.sheets[0].tables[0].style.bandedRows = false
  expect(copied.sheets[0].tables![0].style?.bandedRows).toBe(true)
  expect(Object.isFrozen(copied.sheets[0].tables![0].style)).toBe(true)
  source.sheets[0].tables[0].filterRules[0].values.push('Mouse')
  expect(copied.sheets[0].tables![0].filterRules).toEqual([
    { kind: 'list', colIndex: 0, values: ['Keyboard'] },
  ])
  expect(Object.isFrozen(copied.sheets[0].tables![0].filterRules![0])).toBe(true)
  expect(() => snapshotRustWorkbookDefinition(source)).toThrow('Invalid initial table range')
  source.sheets[0].tables[0].range.rowEnd = 9
  expect(() => snapshotRustWorkbookDefinition(source)).toThrow('Invalid initial table totals row')
})
test('initial table filters reject columns outside their table before starting a worker', () => {
  const source = definition()
  source.sheets[0].tables[0].filterRules[0].colIndex = 2
  expect(() => snapshotRustWorkbookDefinition(source)).toThrow('Invalid initial table filter')
})
test('runtime sends tables only after every content chunk, before publishing ready', async () => {
  const calls: { command: string; payload: Record<string, unknown> }[] = []
  let receive: (event: MessageEvent) => void = () => {}
  const worker: WorkerLike = {
    postMessage(message) {
      const input = message as { id: number; command: string; payload: Record<string, unknown> }
      calls.push(input)
      const result = input.command === 'formula.catalog' ? TEST_FUNCTION_CATALOG : input.command === 'workbook.initialize'
        ? [{ id: 's', index: 0, name: 'Sheet' }]
        : { accepted: (input.payload.cells as unknown[]).length, errors: 0, rejectedFormulas: 0 }
      receive({ data: { id: input.id, ok: true, result } } as MessageEvent)
    },
    addEventListener(type, listener) { if (type === 'message') receive = listener },
    removeEventListener() {}, terminate: vi.fn(),
  }
  const source: RustWorkbookDefinition = { ...definition(), createImportChunks: () => [
    [{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Product' }],
    [{ sheet: 0, row: 1, col: 0, kind: 'text', value: 'Keyboard' }],
  ] }
  const store = createStore()
  await store.setter(startRustWorkbookRuntimeAtom, {
    definition: source, workerFactory: () => worker,
  })
  expect(calls.map((call) => call.command)).toEqual([
    'workbook.initialize', 'workbook.importCells', 'workbook.importCells', 'workbook.importCells',
    'formula.catalog',
  ])
  expect(calls[1].payload.tables).toBeUndefined()
  expect(calls[2].payload.tables).toBeUndefined()
  expect(calls[3].payload).toEqual({ cells: [], tables: [{ sheetId: 's',
    ...source.sheets[0].tables![0],
  }] })
  expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'ready' })
  store.setter(disposeRustWorkbookRuntimeAtom)
})
