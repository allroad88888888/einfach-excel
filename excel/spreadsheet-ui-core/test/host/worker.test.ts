import { expect, test, vi } from 'vitest'
import { installHostWorkerGateway } from '../../src/host/worker'
import { DEFAULT_HOST_CONTROLS } from '../../src/host/policy'
import type { NativeMutationState } from '../../src/host/types'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'

const range = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
function setup() {
  let receive!: (event: MessageEvent) => Promise<void>
  const post = vi.fn()
  let revision = 7
  let fact: NativeMutationState = { sequence: 0, changes: [] }
  const write = vi.fn(() => { mutate(); return true })
  const read = vi.fn((targets: readonly { sheet: number; range: typeof range }[]) =>
    targets.map((target) => ({ ...target, cells: [] })))
  const workbook = { host_mutation_state: () => fact, host_write_cells: write,
    host_read_ranges: read,
    history_state: () => ({ undoCount: 1, redoCount: 0, notice: null,
      entries: [{ sheetChange: true, range, label: 'Add sheet', sheetIndex: 0 }] }),
  } as unknown as WasmWorkbook
  function mutate() {
    revision++
    fact = { sequence: fact.sequence + 1, changes: [{ sheetKey: '11', ranges: [range] },
      { sheetKey: '22', ranges: [{ ...range, rowStart: 30, rowEnd: 30 }] }] }
  }
  const dispatch = vi.fn(async () => { mutate(); return { revision } })
  const drain = vi.fn()
  installHostWorkerGateway({ scope: { addEventListener: (_: string, listener: typeof receive) => {
    receive = listener
  }, postMessage: post } as unknown as DedicatedWorkerGlobalScope,
  workbook: () => workbook, revision: () => revision, advanceRevision: () => ++revision,
  sheets: () => new Map([
    ['a', { id: 'a', index: 0, name: 'A', key: '11', rowCount: 100, colCount: 8 }],
    ['b', { id: 'b', index: 1, name: 'B', key: '22', rowCount: 100, colCount: 8 }],
  ]), drain,
  }, dispatch)
  let nextId = 1
  async function call(command: string, payload: unknown = {}) {
    const id = nextId++
    await receive({ data: { id, command, payload } } as MessageEvent)
    return post.mock.calls.map(([message]) => message).find((message) => message.id === id)
  }
  const events = () => post.mock.calls.map(([message]) => message).filter((message) => message.type === 'event')
  return { call, events, post, dispatch, write, read, drain, mutate, advance: () => revision++,
    fact: () => fact }
}

test('UI input paste clear fill format and history share the native committed fact source', async () => {
  const r = setup()
  const commands = ['cell.setInput', 'clipboard.paste', 'range.clear', 'range.fill',
    'format.setRange', 'history.apply', 'protection.change']
  for (const command of commands) expect((await r.call(command)).ok).toBe(true)
  expect(r.events()).toHaveLength(commands.length)
  for (const [index, { event }] of r.events().entries()) {
    expect(event.kind).toBe(commands[index])
    expect(event.operationId).toBe(`native-${index + 1}`)
    expect(event.source).toBe(commands[index] === 'history.apply' ? 'history' : 'user')
    expect(event.changes).toEqual([{ sheetId: 'a', ranges: [range] },
      { sheetId: 'b', ranges: [{ ...range, rowStart: 30, rowEnd: 30 }] }])
  }
})

test('failure noop revision changes reads and recalculation never invent user modification events', async () => {
  const r = setup()
  r.dispatch.mockImplementationOnce(async () => { r.advance(); return {} })
  expect((await r.call('cell.setInput')).ok).toBe(true)
  r.dispatch.mockRejectedValueOnce(new Error('PROTECTED'))
  expect((await r.call('range.clear')).ok).toBe(false)
  // 即使读取伴随原生异步结算，也不是持久源码修改。
  await r.call('projection.readVisible')
  await r.call('formula.recalculate')
  await r.call('formula.awaitAsync')
  expect(r.events()).toEqual([])
})

test('already committed edits remain observable when the projection throws', async () => {
  const r = setup()
  r.dispatch.mockImplementationOnce(async () => { r.mutate(); throw new Error('projection failed') })
  const response = await r.call('cell.setInput')
  expect(response.error.code).toBe('WORKBOOK_COMMITTED_PRESENTATION_FAILED')
  expect(response.error.detail).toEqual({ committed: true })
  expect(r.events()).toHaveLength(1)
})

test('native host commit stays ok after presentation failure and a host noop emits nothing', async () => {
  const r = setup()
  r.drain.mockImplementationOnce(() => { throw new Error('presentation failed') })
  const response = await r.call('host.writeCells', { cells: [] })
  expect(response.ok).toBe(true)
  expect(response.result).toMatchObject({ changed: true, displayError: { code: 'DISPLAY_FAILED' } })
  expect(r.events()).toHaveLength(1)
  r.write.mockImplementationOnce(() => false)
  const noop = await r.call('host.writeCells', { cells: [] })
  expect(noop.result.changed).toBe(false)
  expect(noop.result.revision).toBe(response.result.revision)
  expect(r.events()).toHaveLength(1)
})

test('Worker rejects readOnly busy structural and runtime-import bypasses before dispatch', async () => {
  const r = setup()
  await r.call('host.configure', { ...DEFAULT_HOST_CONTROLS, readOnly: true })
  expect((await r.call('cell.setInput')).error.code).toBe('HOST_READ_ONLY')
  expect((await r.call('host.writeCells', { cells: [] })).error.code).toBe('HOST_READ_ONLY')
  expect((await r.call('workbook.importCells', { cells: [] })).error.message).toBe('HOST_LIFECYCLE_CLOSED')
  expect(r.dispatch).not.toHaveBeenCalled()
  expect((await r.call('host.readRanges', { targets: [{ sheetId: 'a', range }] })).ok).toBe(true)
  await r.call('host.configure', { ...DEFAULT_HOST_CONTROLS, busy: true, allowSheetStructure: false })
  for (const command of ['cell.setInput', 'clipboard.paste', 'range.clear', 'range.fill', 'history.apply'])
    expect((await r.call(command)).error.code).toBe('HOST_BUSY')
  for (const source of ['api', 'refresh'])
    expect((await r.call('host.writeCells', { cells: [{ sheetId: 'a', row: 0, col: 0,
      input: { kind: 'literal', value: { kind: 'string', value: '00123' } } }], source })).ok).toBe(true)
  expect(r.events().map(({ event }) => event.source)).toEqual(['api', 'refresh'])
  await r.call('host.configure', { ...DEFAULT_HOST_CONTROLS, allowSheetStructure: false })
  for (const command of ['sheet.editStructure', 'workbook.changeSheets', 'workbook.editSheet', 'history.apply'])
    expect((await r.call(command, { direction: 'undo' })).error.code).toBe('HOST_STRUCTURE_DISABLED')
  expect(r.dispatch).not.toHaveBeenCalled()
})

test('multi range reads retain one revision and typed patches use one native call', async () => {
  const r = setup()
  const targets = [{ sheetId: 'a', range }, { sheetId: 'b', range }]
  const result = await r.call('host.readRanges', { targets })
  expect(result.result).toEqual(targets.map((target) => ({ ...target, cells: [], revision: 7 })))
  expect(r.read).toHaveBeenCalledOnce()
  expect((await r.call('host.writeCells', { cells: [{ sheetId: 'b', row: 100, col: 0,
    input: { kind: 'formula', formula: '=1' } }] })).ok).toBe(false)
  expect(r.write).not.toHaveBeenCalled()
  expect((await r.call('host.writeCells', { cells: [], source: 'user' })).ok).toBe(false)
  expect(r.write).not.toHaveBeenCalled()
})
