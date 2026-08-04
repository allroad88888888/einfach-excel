/**
 * @jest-environment node
 *
 * Sparse snapshots must never serialize a spill PROJECTION — REAL WASM
 * engine and REAL `worker-runtime.ts` dispatcher, in process (same harness
 * as vnext-worker-spill-write-wasm.test.ts).
 *
 * Regression pinned here: `snapshot_range_sparse` walked every non-empty
 * address and serialized the nine non-anchor cells of `=SEQUENCE(10)` as
 * `kind:"number"` literals. On restore those literals landed first and
 * OCCUPIED the anchor's own spill region, so `register_spill` answered
 * `#SPILL!` and the anchor's value was gone (`H1` read back `#SPILL!`
 * while `H2..H10` showed the frozen numbers).
 *
 * Why every assertion here comes in pairs: the defect was invisible for as
 * long as `bulk_install_workbook` skipped spill projection — the literals
 * that poisoned the region were also the ones filling the display, so a
 * "displays match" test passed. Each case therefore also probes that the
 * region is a LIVE projection by re-pointing the anchor at a different
 * array: literals keep their old numbers, a projection moves.
 *
 * The TS reference runtime has always excluded projections from
 * `snapshotRangeSparse`; these tests are the WASM half of that contract.
 */

import { beforeAll, describe, expect, jest, test } from '@jest/globals'
import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'

import type * as NodeFsModule from 'node:fs'
import type * as NodePathModule from 'node:path'
import type {
  WorkerLike,
  WorkerWorkbookClient,
  WorkerWorkbookSpreadsheetBackend,
} from '../src-vnext/adapter'

jest.mock('../wasm-pkg/einfach_wasm.js', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { readFileSync } = require('node:fs') as typeof NodeFsModule
  const nodePath = require('node:path') as typeof NodePathModule
  const real = jest.requireActual('../wasm-pkg/einfach_wasm.js') as {
    initSync: (input: { module: ArrayBufferLike }) => unknown
    WasmWorkbook: unknown
  }
  const bytes = readFileSync(nodePath.join(__dirname, '..', 'wasm-pkg', 'einfach_wasm_bg.wasm'))
  real.initSync({
    module: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  return {
    __esModule: true,
    default: async () => undefined,
    WasmWorkbook: real.WasmWorkbook,
  }
})

const SHEET = 'sheet-1'

type Listener = (e: MessageEvent) => void
const toWorker: Listener[] = []
const toClient: Listener[] = []

const inProcessWorker: WorkerLike = {
  postMessage(msg: unknown) {
    for (const listener of [...toWorker]) listener({ data: msg } as MessageEvent)
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
let createBackendImpl: (() => WorkerWorkbookSpreadsheetBackend) | undefined

beforeAll(async () => {
  (globalThis as Record<string, unknown>).self = {
    postMessage(msg: unknown) {
      for (const listener of [...toClient]) listener({ data: msg } as MessageEvent)
    },
    addEventListener(_type: string, listener: Listener) {
      toWorker.push(listener)
    },
  }
  await import('../src-vnext/adapter/worker-runtime')
  const adapter = await import('../src-vnext/adapter')
  createClient = () => adapter.createWorkerWorkbook({ workerFactory: () => inProcessWorker })
  createBackendImpl = () =>
    adapter.createWorkerWorkbookSpreadsheetBackend({
      workerFactory: () => inProcessWorker,
      sheets: [{ id: SHEET, name: 'Sheet1' }],
    })
})

/** Zero-based `H1:H10` — the whole region `=SEQUENCE(10)` spills into. */
const H1_H10 = { sheet: 0, startRow: 0, startCol: 7, endRow: 9, endCol: 7 }
const H1_H10_RANGE: CellRange = { rowStart: 0, rowEnd: 9, colStart: 7, colEnd: 7 }

/** `H1` spills `1..10` down `H1:H10`, so `H2..H10` are projections. */
async function spilledClient(): Promise<WorkerWorkbookClient> {
  const client = createClient!()
  await client.initWorkbook(['Sheet1'])
  expect(await client.setFormula(0, 'H1', '=SEQUENCE(10)')).toBe(true)
  expect(await display(client, 'H10')).toBe('10')
  return client
}

async function display(client: WorkerWorkbookClient, addr: string): Promise<string> {
  const cells = await client.readCells([{ sheet: 0, addr }])
  return cells[0]?.display ?? ''
}

async function displays(client: WorkerWorkbookClient, addrs: string[]): Promise<string[]> {
  const cells = await client.readCells(addrs.map((addr) => ({ sheet: 0, addr })))
  return addrs.map((_, i) => cells[i]?.display ?? '')
}

describe('sparse snapshots carry the spill ANCHOR only', () => {
  test('snapshotRangeSparse over a spilled region returns one formula record', async () => {
    const client = await spilledClient()

    const cells = await client.snapshotRangeSparse(H1_H10)

    expect(cells).toEqual([
      expect.objectContaining({ sheet: 0, addr: 'H1', kind: 'formula', value: '=SEQUENCE(10)' }),
    ])
    client.dispose()
  })

  test('snapshotSparse (whole workbook) agrees, and unrelated literals still ride along', async () => {
    const client = await spilledClient()
    expect(await client.setCell(0, 'A1', { type: 'number', value: 5 })).toBe(true)

    const cells = await client.snapshotSparse()

    expect(cells.map((cell) => cell.addr).sort()).toEqual(['A1', 'H1'])
    client.dispose()
  })
})

describe('persistence v1 roundtrip of a spilled workbook', () => {
  test('the anchor re-spills instead of colliding with its own restored region', async () => {
    const client = await spilledClient()

    const snapshot = await client.snapshotPersistenceV1()
    expect(snapshot.cells).toHaveLength(1)

    const stats = await client.restorePersistenceV1(snapshot)
    expect(stats.restored_cells).toBe(1)

    // Pre-fix: H1 read back '#SPILL!' here while H2/H10 showed the frozen
    // literals the snapshot had baked in.
    expect(await displays(client, ['H1', 'H2', 'H10'])).toEqual(['1', '2', '10'])
    client.dispose()
  })

  test('the restored region is a LIVE projection, not frozen literals', async () => {
    const client = await spilledClient()
    await client.restorePersistenceV1(await client.snapshotPersistenceV1())

    // Re-point the ANCHOR and the whole region must follow it. Frozen
    // literals in the restored region would keep showing 2/4/10 instead —
    // and would additionally collide, flipping H1 to `#SPILL!` (ADR 0006).
    expect(await client.setFormula(0, 'H1', '=SEQUENCE(3,1,100,1)')).toBe(true)

    expect(await displays(client, ['H1', 'H2', 'H3', 'H4', 'H10'])).toEqual([
      '100',
      '101',
      '102',
      '',
      '',
    ])
    client.dispose()
  })
})

describe('undo images carry the spill anchor only', () => {
  let requestId = 500
  async function readRange(
    backend: WorkerWorkbookSpreadsheetBackend,
    range: CellRange,
  ): Promise<DisplayCell[]> {
    const result = await backend.readRangeProjection({
      kind: 'range',
      sheetId: SHEET,
      range,
      requestId: requestId++,
      reason: 'viewport',
    })
    return result.cells
  }

  async function displayColumn(
    backend: WorkerWorkbookSpreadsheetBackend,
    rows: number[],
  ): Promise<string[]> {
    const cells = await readRange(backend, H1_H10_RANGE)
    return rows.map(
      (row) => cells.find((cell) => cell.row === row && cell.col === 7)?.displayValue ?? '',
    )
  }

  async function clearedAndUndone(): Promise<WorkerWorkbookSpreadsheetBackend> {
    const backend = createBackendImpl!()
    await backend.ready()
    await backend.setCellInput({
      kind: 'set-cell-input',
      sheetId: SHEET,
      row: 0,
      col: 7,
      input: '=SEQUENCE(10)',
      requestId: requestId++,
    })
    expect(await displayColumn(backend, [0, 1, 9])).toEqual(['1', '2', '10'])

    // Selecting the whole region and pressing Delete DOES clear it: the
    // anchor's formula goes in the same batch, which tears the spill down,
    // so no ghost cell is left for the clear to be lazy about.
    await backend.clearRange!({
      kind: 'clear-range',
      sheetId: SHEET,
      range: H1_H10_RANGE,
      target: 'values',
    })
    expect(await displayColumn(backend, [0, 1, 9])).toEqual(['', '', ''])

    await backend.undoTransaction!({
      kind: 'undo-transaction',
      transactionId: 'spill-clear',
      requestId: requestId++,
      revision: 0,
    })
    return backend
  }

  test('undo brings the anchor back un-poisoned', async () => {
    const backend = await clearedAndUndone()

    const anchor = (await readRange(backend, H1_H10_RANGE)).find(
      (cell) => cell.row === 0 && cell.col === 7,
    )
    expect(anchor?.formula).toBe('=SEQUENCE(10)')
    expect(anchor?.displayValue).toBe('1')

    // The decisive assertion. The pre-fix before-image carried nine
    // literals ALONGSIDE the anchor formula, so this next anchor edit found
    // its own region occupied and flipped H1 to '#SPILL!'. With the image
    // reduced to the anchor, the re-point spills cleanly and the rows the
    // shorter array no longer covers come out empty.
    await backend.setCellInput({
      kind: 'set-cell-input',
      sheetId: SHEET,
      row: 0,
      col: 7,
      input: '=SEQUENCE(3,1,100,1)',
      requestId: requestId++,
    })
    expect(await displayColumn(backend, [0, 1, 2, 3, 9])).toEqual(['100', '101', '102', '', ''])
    backend.dispose()
  })

  test('undo restores a LIVE region, not just the anchor', async () => {
    const backend = await clearedAndUndone()

    // 这条曾经是 `KNOWN GAP`，断言的是 `['1', '', '']` —— undo 之后只有锚点
    // 有值，H2..H10 一片空白，用户拿不回数组。根因是 `restoreSparse` 走
    // `WorkbookLoader`，而那条路**从不建立 spill 投影**；同一个缺口在粘贴口
    // （`bulk_import_cells`）上是一模一样的形状。当时只有 storage-primary 的
    // `bulk_install_workbook` 和单格急切写入这两条路会投影。
    //
    // 现在 `WorkbookLoader::flush` 补上了投影尾，一处修好粘贴与 undo 两条，
    // 所以断言按当初写下的翻转指令改成 1 / 2 / 10。
    //
    // 这也补上了 ADR 0006（溢出区写入语义）硬约束 A 的另一半：那条约束担心的
    // 是「Ctrl+Z 永久损坏工作簿」，而缺投影尾正是它成立的机制之一。
    expect(await displayColumn(backend, [0, 1, 9])).toEqual(['1', '2', '10'])
    backend.dispose()
  })
})
