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
  const store = createStore()
  const calls: { command: string; payload: Record<string, unknown> }[] = []
  let receive: (event: MessageEvent) => void = () => {}
  let configureId: number | undefined
  const worker: WorkerLike = {
    postMessage(message) {
      const input = message as { id: number; command: string; payload: Record<string, unknown> }
      calls.push(input)
      if (input.command === 'formula.awaitAsync') return
      // 配置完成前不发布 ready；显式延迟 ACK，不能把无 cells 的控制命令当作导入。
      if (input.command === 'host.configure') { configureId = input.id; return }
      let result
      switch (input.command) {
        case 'workbook.initialize': result = [{ id: 's', index: 0, name: 'Sheet' }]; break
        case 'formula.catalog': result = TEST_FUNCTION_CATALOG; break
        case 'workbook.importCells':
          result = { accepted: (input.payload.cells as unknown[]).length,
            errors: 0, rejectedFormulas: 0 }
          break
        default: throw new Error(`Unexpected startup command: ${input.command}`)
      }
      receive({ data: { id: input.id, ok: true, result } } as MessageEvent)
    },
    addEventListener(type, listener) { if (type === 'message') receive = listener },
    removeEventListener() {}, terminate: vi.fn(),
  }
  const chunks = [
    [{ sheet: 0, row: 0, col: 0, kind: 'text', value: 'Product' }],
    [{ sheet: 0, row: 1, col: 0, kind: 'text', value: 'Keyboard' }],
  ] as const
  const source: RustWorkbookDefinition = { ...definition(), createImportChunks: () => chunks }
  const starting = store.setter(startRustWorkbookRuntimeAtom, {
    definition: source, workerFactory: () => worker,
  })
  await vi.waitFor(() => expect(configureId).toBeTypeOf('number'))
  expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'loading' })
  expect(calls.map((call) => call.command)).toEqual([
    'workbook.initialize', 'workbook.importCells', 'workbook.importCells', 'workbook.importCells',
    'formula.catalog', 'host.configure',
  ])
  expect(calls[5].payload).toEqual({ readOnly: false, busy: false, allowSheetStructure: true })
  receive({ data: { id: configureId!, ok: true, result: undefined } } as MessageEvent)
  await starting
  await vi.waitFor(() => expect(calls.at(-1)?.command).toBe('formula.awaitAsync'))
  expect(calls.map((call) => call.command)).toEqual([
    'workbook.initialize', 'workbook.importCells', 'workbook.importCells', 'workbook.importCells',
    'formula.catalog', 'host.configure', 'formula.awaitAsync',
  ])
  expect(calls[0].payload).toEqual({ sheets: source.sheets, customFormulas: undefined })
  expect(calls[1].payload).toEqual({ cells: chunks[0] })
  expect(calls[2].payload).toEqual({ cells: chunks[1] })
  expect(calls[1].payload.tables).toBeUndefined()
  expect(calls[2].payload.tables).toBeUndefined()
  expect(calls[3].payload).toEqual({ cells: [], tables: [{ sheetId: 's',
    ...source.sheets[0].tables![0],
  }] })
  expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'ready' })
  store.setter(disposeRustWorkbookRuntimeAtom)
  expect(worker.terminate).toHaveBeenCalledOnce()
})
