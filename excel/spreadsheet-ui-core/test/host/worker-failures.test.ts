import { expect, test, vi } from 'vitest'
import { installHostWorkerGateway } from '../../src/host/worker'
import { editWorkbookSheet } from '../../src/rust-workbook/sheet-edit'
import type { RustWorkbookCommands, RustWorkbookSheet } from '../../src/rust-workbook/commands'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'
import type { NativeMutationState } from '../../src/host/types'

const range = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
function setup(mode: 'metadata' | 'unmapped') {
  let receive!: (event: MessageEvent) => Promise<void>
  let revision = 7
  let fact: NativeMutationState = { sequence: 0, changes: [] }
  let rejectedEvents = 0, rejectedResponses = 0
  const delivered: Record<string, any>[] = []
  const post = vi.fn((message: Record<string, any>) => {
    if (message.type === 'event' && rejectedEvents-- > 0) throw new Error('event channel fault')
    if (message.type !== 'event' && rejectedResponses-- > 0) throw new Error('response channel fault')
    delivered.push(message)
  })
  const sheets = new Map<string, RustWorkbookSheet>([['old', {
    id: 'old', index: 0, key: '1', name: 'Old', rowCount: 20, colCount: 8,
  }]])
  const mutate = (key: string) => {
    fact = { sequence: fact.sequence + 1, changes: [{ sheetKey: key, ranges: [range] }] }
  }
  const workbook = {
    host_mutation_state: () => fact,
    host_read_ranges: (targets: unknown[]) =>
      targets.map((target) => ({ ...(target as object), cells: [] })),
    edit_sheet: () => { mutate('2'); return 1 }, sheet_key: () => '2',
    sheet_name: () => { throw new Error('sheet_name failed after native add') },
  } as unknown as WasmWorkbook
  const dispatch = vi.fn(async (command: keyof RustWorkbookCommands, payload: unknown) => {
    if (command === 'workbook.editSheet') {
      if (mode === 'unmapped') { mutate('2'); throw new Error('metadata failed before identity registration') }
      return editWorkbookSheet(workbook, sheets,
        payload as RustWorkbookCommands['workbook.editSheet']['payload'], revision + 1)
    }
    if (command === 'cell.setInput') { mutate('1'); return {} }
    throw new Error('command failed before commit')
  })
  installHostWorkerGateway({ scope: {
    addEventListener: (_: string, listener: typeof receive) => { receive = listener },
    postMessage: post,
  } as unknown as DedicatedWorkerGlobalScope,
  workbook: () => workbook, sheets: () => sheets, revision: () => revision,
  advanceRevision: () => ++revision, drain: () => {},
  }, dispatch)
  let nextId = 1
  async function call(command: string, payload: unknown = {}) {
    const id = nextId++
    await receive({ data: { id, command, payload } } as MessageEvent)
    return delivered.find((message) => message.id === id)
  }
  const read = () => call('host.readRanges', { targets: [{ sheetId: 'old', range }] })
  return { call, read, sheets, delivered, dispatch,
    rejectEvents: (count: number) => { rejectedEvents = count },
    rejectResponses: (count: number) => { rejectedResponses = count } }
}

test('native add identity is registered before failing name presentation and next read still serves', async () => {
  const r = setup('metadata')
  const response = await r.call('workbook.editSheet', { name: 'Added', rowCount: 20, colCount: 8 })
  expect(response?.error.code).toBe('WORKBOOK_COMMITTED_PRESENTATION_FAILED')
  expect(response?.error.detail).toEqual({ committed: true })
  const added = [...r.sheets.values()].find((sheet) => sheet.key === '2')!
  expect(added.id).toBeTruthy()
  expect(added.name).toBe('Added')
  const event = r.delivered.find((message) => message.type === 'event')!.event
  expect(event).toMatchObject({ kind: 'workbook.editSheet', revision: 8,
    changes: [{ sheetId: added.id, ranges: [range] }] })
  expect((await r.read())?.ok).toBe(true)
})

test('unmapped committed fact produces explicit whole-workbook invalidation and committed diagnostic', async () => {
  const r = setup('unmapped')
  const response = await r.call('workbook.editSheet', { name: 'Added' })
  expect(response?.error.code).toBe('WORKBOOK_COMMITTED_PRESENTATION_FAILED')
  expect(response?.error.detail).toMatchObject({ committed: true, notificationPublished: true,
    nativeMutation: { sequence: 1, changes: [{ sheetKey: '2', ranges: [range] }] } })
  const events = r.delivered.filter((message) => message.type === 'event')
  expect(events).toHaveLength(1)
  expect(events[0].event).toMatchObject({ kind: 'workbook.editSheet.committed-unmapped',
    operationId: 'native-1', changes: [], source: 'user' })
  expect((await r.read())?.ok).toBe(true)
})

test('failed notification delivery retains native fact diagnostics instead of silently consuming sequence', async () => {
  const r = setup('metadata')
  r.rejectEvents(2)
  const response = await r.call('workbook.editSheet', { name: 'Added' })
  expect(response?.error.detail).toMatchObject({ committed: true, notificationPublished: false,
    nativeMutation: { sequence: 1 } })
  expect(r.delivered.filter((message) => message.type === 'event')).toHaveLength(0)
  expect((await r.read())?.ok).toBe(true)
  expect((await r.call('cell.setInput'))?.ok).toBe(true)
  expect(r.delivered.find((message) => message.type === 'event')!.event.operationId).toBe('native-2')
})

test('error response posting itself cannot reject the service queue', async () => {
  const r = setup('metadata')
  r.rejectResponses(1)
  // postMessage 本身失效时不能保证送达，但异常不得逸出或阻塞下一条消息。
  expect(await r.call('range.clear')).toBeUndefined()
  expect((await r.read())?.ok).toBe(true)
})
