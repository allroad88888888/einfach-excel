/** @jest-environment node */

import { beforeAll, describe, expect, jest, test } from '@jest/globals'
import { DEFAULT_PRINT_CONFIG, type PrintConfig } from '@einfach/spreadsheet-ui-core'
import type * as NodeFsModule from 'node:fs'
import type * as NodePathModule from 'node:path'
import type {
  WorkerLike,
  WorkerWorkbookClient,
  WorkerWorkbookSpreadsheetBackend,
} from '../src-vnext/adapter'

jest.mock('@einfach/excel-wasm', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { readFileSync } = require('node:fs') as typeof NodeFsModule
  const nodePath = require('node:path') as typeof NodePathModule
  const real = jest.requireActual('@einfach/excel-wasm') as {
    initSync: (input: { module: ArrayBufferLike }) => unknown
    WasmWorkbook: unknown
  }
  const bytes = readFileSync(nodePath.join(__dirname, '..', '..', 'excel-wasm', 'lite', 'einfach_wasm_bg.wasm'))
  real.initSync({
    module: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  return { __esModule: true, default: async () => undefined, WasmWorkbook: real.WasmWorkbook }
})

const SHEET = 'sheet-1'
type Listener = (event: MessageEvent) => void
const toWorker: Listener[] = []
const toClient: Listener[] = []

const inProcessWorker: WorkerLike = {
  postMessage(message: unknown) {
    for (const listener of [...toWorker]) listener({ data: message } as MessageEvent)
  },
  addEventListener(_type: 'message', listener: Listener) {
    toClient.push(listener)
  },
  removeEventListener(_type: 'message', listener: Listener) {
    const index = toClient.indexOf(listener)
    if (index >= 0) toClient.splice(index, 1)
  },
  terminate() {},
}

let createClient: (() => WorkerWorkbookClient) | undefined
let createBackend: ((client: WorkerWorkbookClient) => WorkerWorkbookSpreadsheetBackend) | undefined

beforeAll(async () => {
  const workerScope = globalThis as Record<string, unknown>
  workerScope.self = {
    postMessage(message: unknown) {
      for (const listener of [...toClient]) listener({ data: message } as MessageEvent)
    },
    addEventListener(_type: string, listener: Listener) {
      toWorker.push(listener)
    },
  }
  await import('../src-vnext/adapter/worker-runtime')
  const adapter = await import('../src-vnext/adapter')
  createClient = () => adapter.createWorkerWorkbook({ workerFactory: () => inProcessWorker })
  createBackend = (client) =>
    adapter.createWorkerWorkbookSpreadsheetBackend({
      client,
      sheets: [{ id: SHEET, name: 'Sheet1' }],
    })
})

function landscapeConfig(): PrintConfig {
  return {
    ...DEFAULT_PRINT_CONFIG,
    orientation: 'landscape',
    scale: { kind: 'fit', pagesWide: 1, pagesTall: 2 },
    manualPageBreaks: [{ axis: 'row', index: 5 }],
  }
}

describe('print configuration — real WASM worker engine', () => {
  test('uses Rust binding for exact ACK/read-back and persistence restart', async () => {
    const client = createClient!()
    const backend = createBackend!(client)
    await backend.ready()

    expect(
      await backend.setPrintConfig!({
        kind: 'set-print-config',
        sheetId: SHEET,
        requestId: 31,
        config: landscapeConfig(),
      }),
    ).toEqual({ sheetId: SHEET, requestId: 31, revision: 1 })
    expect(
      await backend.readPrintConfig!({ kind: 'read-print-config', sheetId: SHEET, requestId: 32 }),
    ).toMatchObject({
      kind: 'print-config',
      sheetId: SHEET,
      requestId: 32,
      revision: 1,
      config: { orientation: 'landscape' },
    })

    const snapshot = await client.snapshotPersistenceV1()
    expect(snapshot.printConfigs).toMatchObject([
      { sheet: 0, revision: 1, config: { orientation: 'landscape' } },
    ])
    await client.setPrintConfig!(0, { ...landscapeConfig(), orientation: 'portrait' })
    expect(await client.restorePersistenceV1(snapshot)).toMatchObject({ restored_print_configs: 1 })
    expect(
      await backend.readPrintConfig!({ kind: 'read-print-config', sheetId: SHEET, requestId: 33 }),
    ).toMatchObject({ revision: 1, config: { orientation: 'landscape' } })
    client.dispose()
  })
})
