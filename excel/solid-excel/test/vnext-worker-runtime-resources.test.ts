import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'

import type { ImportSession } from '../src/adapter/worker-import-normalize'
import { createWorkerWorkbookRuntimeResources } from '../src/adapter/worker-runtime-resources'
import type { WasmWorkbookRuntime } from '../src/adapter/wasm-workbook-surface'

type PostedMessage = { id?: number; ok?: boolean; result?: unknown }

const posted: PostedMessage[] = []
let originalPostMessage: typeof self.postMessage

beforeEach(() => {
  posted.length = 0
  originalPostMessage = self.postMessage
  self.postMessage = ((message: PostedMessage) => posted.push(message)) as typeof self.postMessage
})

afterEach(() => {
  self.postMessage = originalPostMessage
})

function createWorkbook(unsubscribed: number[]): WasmWorkbookRuntime {
  let nextSubscriptionToken = 1
  return {
    sheet_count: () => 1,
    sheet_name: () => 'Sheet1',
    subscribe_cell: () => nextSubscriptionToken++,
    unsubscribe_cell: (token: number) => unsubscribed.push(token),
    snapshotCell: (sheet: number, addr: string) => ({
      sheet,
      addr,
      display: '',
      type: 'null',
      isError: false,
      formula: '',
    }),
  } as unknown as WasmWorkbookRuntime
}

function customFormulaResult(
  resources: ReturnType<typeof createWorkerWorkbookRuntimeResources>,
  id: number,
  cmd: Record<string, unknown>,
): unknown {
  expect(resources.customFormulas.handleCommand(id, cmd as never, {} as WasmWorkbookRuntime)).toBe(
    true,
  )
  return posted.find((message) => message.id === id)?.result
}

describe('worker workbook runtime resources', () => {
  test('keeps stream handles and subscriptions owned by their workbook runtime', () => {
    const firstUnsubscribed: number[] = []
    const secondUnsubscribed: number[] = []
    const firstWorkbook = createWorkbook(firstUnsubscribed)
    const secondWorkbook = createWorkbook(secondUnsubscribed)
    const first = createWorkerWorkbookRuntimeResources(() => firstWorkbook)
    const second = createWorkerWorkbookRuntimeResources(() => secondWorkbook)

    first.sessionHandles.importSessions.set(1, {} as ImportSession)
    first.sessionHandles.exportSessions.set(1, {} as never)
    first.sessionHandles.snapshotSessions.set(1, {} as never)
    second.sessionHandles.importSessions.set(2, {} as ImportSession)
    expect(
      first.sessionHandles.handleSubscriptionCommand(
        1,
        { cmd: 'subscribeCells', subId: 9, cells: [{ sheet: 0, addr: 'a1' }] } as never,
        firstWorkbook,
      ),
    ).toBe(true)

    expect(first.sessionHandles.sessionHandleCounts()).toEqual({
      subscriptions: 1,
      imports: 1,
      exports: 1,
      snapshots: 1,
    })
    expect(second.sessionHandles.sessionHandleCounts()).toEqual({
      subscriptions: 0,
      imports: 1,
      exports: 0,
      snapshots: 0,
    })
    expect(first.sessionHandles.allocateExportSessionId()).toBe(1)
    expect(second.sessionHandles.allocateExportSessionId()).toBe(1)

    first.resetForNewWorkbook(firstWorkbook)

    expect(firstUnsubscribed).toEqual([1])
    expect(secondUnsubscribed).toEqual([])
    expect(first.sessionHandles.sessionHandleCounts()).toEqual({
      subscriptions: 0,
      imports: 0,
      exports: 0,
      snapshots: 0,
    })
    expect(second.sessionHandles.sessionHandleCounts().imports).toBe(1)
    expect(first.sessionHandles.allocateExportSessionId()).toBe(1)
  })

  test('clears compiled custom formulas only for the reset workbook runtime', () => {
    const first = createWorkerWorkbookRuntimeResources(() => undefined)
    const second = createWorkerWorkbookRuntimeResources(() => undefined)

    expect(
      customFormulaResult(first, 1, {
        cmd: 'registerCustomFormula',
        name: 'FIRST_ONLY',
        source: 'return 1',
      }),
    ).toBe(false)
    expect(
      customFormulaResult(second, 2, {
        cmd: 'registerCustomFormula',
        name: 'SECOND_ONLY',
        source: 'return 2',
      }),
    ).toBe(false)

    first.resetForNewWorkbook()

    expect(
      customFormulaResult(first, 3, { cmd: 'unregisterCustomFormula', name: 'FIRST_ONLY' }),
    ).toBe(false)
    expect(
      customFormulaResult(second, 4, { cmd: 'unregisterCustomFormula', name: 'SECOND_ONLY' }),
    ).toBe(true)
  })
})
