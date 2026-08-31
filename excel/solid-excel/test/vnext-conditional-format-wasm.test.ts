/** @jest-environment node */

import { beforeAll, describe, expect, jest, test } from '@jest/globals'
import type * as NodeFsModule from 'node:fs'
import type * as NodePathModule from 'node:path'
import type {
  WorkerLike,
  WorkerWorkbookClient,
  WorkerWorkbookSpreadsheetBackend,
} from '../src/adapter'
import { getDataBarProjection } from '../src/adapter/data-bar-projection'

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
const RANGE = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 }
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
  await import('../src/adapter/worker-runtime')
  const adapter = await import('../src/adapter')
  createClient = () => adapter.createWorkerWorkbook({ workerFactory: () => inProcessWorker })
  createBackend = (client) =>
    adapter.createWorkerWorkbookSpreadsheetBackend({
      client,
      sheets: [{ id: SHEET, name: 'Sheet1' }],
    })
})

describe('conditional-format — real WASM worker engine', () => {
  test('keeps the canonical config in Rust and restores it from persistence', async () => {
    const client = createClient!()
    const backend = createBackend!(client)
    await backend.ready()
    const setRequest = {
      kind: 'set-conditional-format-rule' as const,
      sheetId: SHEET,
      requestId: 61,
      revision: 0,
      scope: { range: RANGE },
      rule: {
        kind: 'cell-value' as const,
        operator: 'gt' as const,
        value: '10',
        format: { bgColor: '#fef3c7' },
      },
    }
    expect(await backend.setConditionalFormatRule!(setRequest)).toEqual({
      sheetId: SHEET,
      requestId: 61,
      revision: 1,
      affectedRange: RANGE,
    })
    await expect(
      backend.setConditionalFormatRule!({ ...setRequest, requestId: 62 }),
    ).rejects.toMatchObject({
      code: 'STALE_CONDITIONAL_FORMAT_REVISION',
    })
    const listed = await backend.listConditionalFormatRules!({
      kind: 'list-conditional-format-rules',
      sheetId: SHEET,
      requestId: 63,
    })
    expect(listed).toMatchObject({
      revision: 1,
      rules: [{ scope: { range: RANGE }, rule: setRequest.rule }],
    })

    const snapshot = await client.snapshotPersistenceV1()
    expect(snapshot.conditionalFormats).toMatchObject([
      { sheet: 0, revision: 1, rules: [{ scope: { range: RANGE }, rule: setRequest.rule }] },
    ])
    await client.removeConditionalFormatRule!(0, {
      requestId: 64,
      revision: 1,
      ruleId: listed.rules[0].id,
    })
    expect(await client.restorePersistenceV1(snapshot)).toMatchObject({
      restored_conditional_formats: 1,
    })
    expect(
      await backend.listConditionalFormatRules!({
        kind: 'list-conditional-format-rules',
        sheetId: SHEET,
        requestId: 65,
      }),
    ).toMatchObject({
      revision: 1,
      rules: [{ scope: { range: RANGE }, rule: setRequest.rule }],
    })

    const { conditionalFormats: _conditionalFormats, ...legacySnapshot } = snapshot
    expect(await client.restorePersistenceV1(legacySnapshot)).toMatchObject({
      restored_conditional_formats: 0,
    })
    expect(
      await backend.listConditionalFormatRules!({
        kind: 'list-conditional-format-rules',
        sheetId: SHEET,
        requestId: 66,
      }),
    ).toMatchObject({ revision: 0, rules: [] })
    client.dispose()
  })

  test('projects a Color Scale from the full canonical rule range', async () => {
    const client = createClient!()
    const backend = createBackend!(client)
    await backend.ready()
    for (const [row, input] of ['0', '25', '50', '75', '100'].entries()) {
      await backend.setCellInput({ kind: 'set-cell-input', sheetId: SHEET, row, col: 0, input })
    }
    await backend.setConditionalFormatRule!({
      kind: 'set-conditional-format-rule',
      sheetId: SHEET,
      requestId: 71,
      revision: 0,
      scope: { range: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 0 } },
      rule: {
        kind: 'color-scale',
        minColor: '#ff0000',
        midColor: '#ffff00',
        maxColor: '#00ff00',
      },
    })
    expect(
      await backend.listConditionalFormatRules!({
        kind: 'list-conditional-format-rules',
        sheetId: SHEET,
        requestId: 711,
      }),
    ).toMatchObject({ rules: [{ rule: { kind: 'color-scale' } }] })

    const result = await backend.readRangeProjection({
      kind: 'range',
      sheetId: SHEET,
      requestId: 72,
      reason: 'viewport',
      range: { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 },
    })
    expect(result.cells.map((cell) => cell.conditionalFormat?.bgColor)).toEqual([
      'rgb(255, 128, 0)',
      '#ffff00',
      'rgb(128, 255, 0)',
    ])
    client.dispose()
  })

  test('projects Data Bar ratios from the complete canonical rule range', async () => {
    const client = createClient!()
    const backend = createBackend!(client)
    await backend.ready()
    for (const [row, input] of ['-100', '-50', '0', '50', '100', 'text'].entries()) {
      await backend.setCellInput({ kind: 'set-cell-input', sheetId: SHEET, row, col: 0, input })
    }
    const dataBar = await backend.setConditionalFormatRule!({
      kind: 'set-conditional-format-rule',
      sheetId: SHEET,
      requestId: 81,
      revision: 0,
      scope: { range: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 0 } },
      priority: 0,
      rule: { kind: 'data-bar', minColor: '#eff6ff', maxColor: '#1d4ed8' },
    })
    await backend.setConditionalFormatRule!({
      kind: 'set-conditional-format-rule',
      sheetId: SHEET,
      requestId: 811,
      revision: dataBar.revision,
      scope: { range: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 0 } },
      priority: 1,
      rule: { kind: 'cell-value', operator: 'gt', value: '-1000', format: { bgColor: '#111111' } },
    })
    const result = await backend.readRangeProjection({
      kind: 'range',
      sheetId: SHEET,
      requestId: 82,
      reason: 'viewport',
      range: { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 },
    })
    expect(result.cells.map((cell) => getDataBarProjection(cell)?.ratio)).toEqual([0.25, 0.5, 0.75])
    // A later matching rule cannot replace the first Data Bar visual.
    expect(result.cells.every((cell) => cell.conditionalFormat === undefined)).toBe(true)
    client.dispose()
  })

  test('projects Top/Bottom from the complete range before lower priorities', async () => {
    const client = createClient!()
    const backend = createBackend!(client)
    await backend.ready()
    for (const [row, input] of ['100', '90', '90', '80'].entries()) {
      await backend.setCellInput({ kind: 'set-cell-input', sheetId: SHEET, row, col: 0, input })
    }
    const top = await backend.setConditionalFormatRule!({
      kind: 'set-conditional-format-rule',
      sheetId: SHEET,
      requestId: 91,
      revision: 0,
      scope: { range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 0 } },
      priority: 0,
      rule: { kind: 'top-bottom', direction: 'top', count: 2, format: { bgColor: '#ef4444' } },
    })
    await backend.setConditionalFormatRule!({
      kind: 'set-conditional-format-rule',
      sheetId: SHEET,
      requestId: 92,
      revision: top.revision,
      scope: { range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 0 } },
      priority: 1,
      rule: { kind: 'cell-value', operator: 'gt', value: '-1000', format: { bgColor: '#22c55e' } },
    })
    const result = await backend.readRangeProjection({
      kind: 'range',
      sheetId: SHEET,
      requestId: 93,
      reason: 'viewport',
      range: { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 },
    })
    expect(result.cells.map((cell) => cell.conditionalFormat?.bgColor)).toEqual([
      '#ef4444',
      '#22c55e',
      '#22c55e',
    ])
    client.dispose()
  })
})
