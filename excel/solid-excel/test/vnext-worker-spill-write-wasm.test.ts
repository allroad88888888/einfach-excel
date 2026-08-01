/**
 * @jest-environment node
 *
 * Excel spill-region write semantics over the REAL WASM engine and the REAL
 * `worker-runtime.ts` dispatcher, in process (same harness as
 * vnext-worker-sort-wasm.test.ts).
 *
 * History: this suite pinned the OPPOSITE contract — the engine refused such
 * a write and the dispatcher forwarded `CELL_WRITE_REJECTED { code:
 * 'spill-write', anchor }`. ADR 0006 retired it: the write now LANDS, the
 * array is withdrawn (other projection cells go blank), the anchor shows
 * `#SPILL!`, and clearing the blocker revives it.
 *
 * The reason this suite exists is unchanged — A KEYSTROKE MAY NEVER GO
 * MISSING — only the shape of "missing" moved. Four ways to lose one now:
 *
 *   1. the write is dropped and a success-shaped ACK comes back anyway
 *      (what the infallible `set_cell_*` twins used to do);
 *   2. the write lands but the anchor KEEPS SPILLING, so the projection
 *      immediately paints over it — same disappearance, new hat;
 *   3. the array is withdrawn but the user's value goes with it;
 *   4. the withdrawal is DESTRUCTIVE (the anchor loses its formula), so
 *      clearing the blocker can never bring the data back.
 *
 * So every assertion is CLOSED FORM over the whole `H1:H10` region plus the
 * anchor's formula source, never a bare "it did not throw": (1) reads back
 * `1..10`, (2) reads the projected number at the written cell, (3) reads
 * blank there, (4) surfaces on the revive round trip.
 *
 * NOT symmetric: writing `null` (Delete / clear) is LAZY and leaves the array
 * standing — a blank cannot block a spill, so collapse-then-reproject would
 * reproduce the same region, and Excel and the TS reference engine
 * (`excel-core-ts/src/workbook.ts`) both skip the work. Hence a separate suite.
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
const ANCHOR_SOURCE = '=SEQUENCE(10)'
/** `H1` spills `1..10` down `H1:H10`. */
const H_COLUMN = Array.from({ length: 10 }, (_, i) => `H${i + 1}`)
const SPILLED = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

/** The whole region once a blocker sits at 0-based `row` showing `display`. */
function withdrawn(row: number, display: string): string[] {
  return H_COLUMN.map((_, i) => (i === 0 ? '#SPILL!' : i === row ? display : ''))
}

type Listener = (e: MessageEvent) => void
const toWorker: Listener[] = []
const toClient: Listener[] = []
const post = (listeners: Listener[], msg: unknown) => {
  for (const listener of [...listeners]) listener({ data: msg } as MessageEvent)
}

const inProcessWorker: WorkerLike = {
  postMessage: (msg) => post(toWorker, msg),
  addEventListener: (_type: 'message', listener: Listener) => void toClient.push(listener),
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
    postMessage: (msg: unknown) => post(toClient, msg),
    addEventListener: (_type: string, listener: Listener) => void toWorker.push(listener),
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

async function displays(client: WorkerWorkbookClient, addrs: string[]): Promise<string[]> {
  const cells = await client.readCells(addrs.map((addr) => ({ sheet: 0, addr })))
  return addrs.map((_, i) => cells[i]?.display ?? '')
}

/** `H1:H10` displays, row-major — the closed form every assertion compares. */
const column = (client: WorkerWorkbookClient) => displays(client, H_COLUMN)

/** The anchor's SOURCE. A withdrawn array must still own its formula. */
const anchorFormula = async (client: WorkerWorkbookClient): Promise<string> =>
  (await client.readCells([{ sheet: 0, addr: 'H1' }]))[0]?.formula ?? ''

async function spilledClient(): Promise<WorkerWorkbookClient> {
  const client = createClient!()
  await client.initWorkbook(['Sheet1'])
  expect(await client.setFormula(0, 'H1', ANCHOR_SOURCE)).toBe(true)
  expect(await column(client)).toEqual(SPILLED)
  return client
}

describe('a spill-region write LANDS and withdraws the array (ADR 0006)', () => {
  test.each([
    { type: 'text' as const, value: 'blocker', shown: 'blocker' },
    { type: 'number' as const, value: 42, shown: '42' },
    { type: 'boolean' as const, value: true, shown: 'TRUE' },
    { type: 'error' as const, value: '#N/A', shown: '#N/A' },
  ])('setCell($type) into a spill target keeps the value, flips the anchor', async (wire) => {
    const client = await spilledClient()
    expect(await client.setCell(0, 'H2', wire)).toBe(true)

    // Closed form over the WHOLE region in one comparison: a dropped write
    // reads back `1..10`, a still-spilling anchor reads `2` at H2, a partial
    // withdrawal leaves stale numbers below — each names its cells in the diff.
    expect(await column(client)).toEqual(withdrawn(1, wire.shown))
    // Withdrawn, not destroyed: the anchor still owns its source, which is
    // the only thing that makes the revive below possible.
    expect(await anchorFormula(client)).toBe(ANCHOR_SOURCE)
    client.dispose()
  })

  test('setFormula and setFormulaDetailed into a spill target land too', async () => {
    const bare = await spilledClient()
    expect(await bare.setFormula(0, 'H3', '=1+1')).toBe(true)
    expect(await column(bare)).toEqual(withdrawn(2, '2'))
    bare.dispose()

    const detailed = await spilledClient()
    expect(await detailed.setFormulaDetailed(0, 'H4', '=1+1')).toMatchObject({ ok: true })
    expect(await column(detailed)).toEqual(withdrawn(3, '2'))
    expect(await anchorFormula(detailed)).toBe(ANCHOR_SOURCE)
    detailed.dispose()
  })

  test('clearing the blocker REVIVES the array (phase 2)', async () => {
    const client = await spilledClient()
    expect(await client.setCell(0, 'H5', { type: 'text', value: 'blocker' })).toBe(true)
    expect(await column(client)).toEqual(withdrawn(4, 'blocker'))
    expect(await client.clearCell(0, 'H5')).toBe(true)

    // Every projected value is back — not just the anchor. A phase-1-only
    // engine would leave `#SPILL!` standing here forever.
    expect(await column(client)).toEqual(SPILLED)
    client.dispose()
  })

  test('the spill ANCHOR itself stays writable (it owns the array)', async () => {
    const client = await spilledClient()
    expect(await client.setCell(0, 'H1', { type: 'text', value: 'replaced' })).toBe(true)

    // The array is torn down entirely — no `#SPILL!`, nothing left spilling.
    expect(await column(client)).toEqual(['replaced', '', '', '', '', '', '', '', '', ''])
    client.dispose()
  })
})

describe('clearing a spill projection is LAZY — the array stands', () => {
  test.each([
    ['setCell(null)', (c: WorkerWorkbookClient) => c.setCell(0, 'H2', { type: 'null' })],
    ['clearCell', (c: WorkerWorkbookClient) => c.clearCell(0, 'H2')],
  ])('%s over a spill target is a no-op, not a withdrawal', async (_label, clear) => {
    const client = await spilledClient()
    expect(await clear(client)).toBe(true)

    // A blank cannot block a spill, so collapse-then-reproject would rebuild
    // this exact region — Excel and the TS reference engine both skip the
    // work. `#SPILL!` at H1 here is a REGRESSION, not a stricter ADR 0006.
    expect(await column(client)).toEqual(SPILLED)
    expect(await anchorFormula(client)).toBe(ANCHOR_SOURCE)
    client.dispose()
  })
})

describe('ordinary writes do not regress on the fallible bindings', () => {
  test('setCell / clearCell / setFormula keep their success contract', async () => {
    const client = createClient!()
    await client.initWorkbook(['Sheet1'])

    expect(await client.setCell(0, 'A1', { type: 'number', value: 7 })).toBe(true)
    expect(await client.setCell(0, 'A2', { type: 'text', value: 'hi' })).toBe(true)
    expect(await client.setCell(0, 'A3', { type: 'boolean', value: true })).toBe(true)
    expect(await client.setCell(0, 'A4', { type: 'error', value: '#N/A' })).toBe(true)
    expect(await client.setFormula(0, 'B1', '=A1*2')).toBe(true)
    expect(await displays(client, ['A1', 'A2', 'B1'])).toEqual(['7', 'hi', '14'])

    expect(await client.clearCell(0, 'A1')).toBe(true)
    expect(await client.setCell(0, 'A2', { type: 'null' })).toBe(true)
    expect(await displays(client, ['A1', 'A2'])).toEqual(['', ''])
    client.dispose()
  })

  test('parse failure and cycles still report as install outcomes, not refusals', async () => {
    const client = createClient!()
    await client.initWorkbook(['Sheet1'])

    // `installed: false` is NOT a refusal — the cell already says #VALUE!.
    expect(await client.setFormula(0, 'C1', '=SUM(')).toBe(false)
    expect(await client.setFormulaDetailed(0, 'C2', '=SUM(')).toEqual({
      ok: false,
      code: 'INVALID_FORMULA',
      message: 'formula could not be parsed or installed',
      display: expect.any(String),
    })

    expect(await client.setFormulaDetailed(0, 'C3', '=C3+1')).toMatchObject({
      ok: false,
      code: 'FORMULA_CYCLE',
    })
    client.dispose()
  })
})

describe('the semantics survive the host backend port (setCellInput)', () => {
  type Backend = WorkerWorkbookSpreadsheetBackend
  const H1_H10: CellRange = { rowStart: 0, rowEnd: 9, colStart: 7, colEnd: 7 }
  let requestId = 100

  async function write(backend: Backend, row: number, input: string): Promise<void> {
    const req = { kind: 'set-cell-input' as const, sheetId: SHEET, col: 7, requestId: requestId++ }
    await backend.setCellInput({ ...req, row, input })
  }

  /** Same closed form as `column`, read back through the host port. */
  async function backendColumn(backend: Backend): Promise<string[]> {
    const result = await backend.readRangeProjection({
      kind: 'range',
      sheetId: SHEET,
      range: H1_H10,
      requestId: requestId++,
      reason: 'viewport',
    })
    const byRow = new Map<number, DisplayCell>(result.cells.map((cell) => [cell.row, cell]))
    return H_COLUMN.map((_, row) => byRow.get(row)?.displayValue ?? '')
  }

  async function spilledBackend(): Promise<Backend> {
    const backend = createBackendImpl!()
    await backend.ready()
    await write(backend, 0, ANCHOR_SOURCE)
    expect(await backendColumn(backend)).toEqual(SPILLED)
    return backend
  }

  test.each([
    { label: 'literal', input: 'blocker', shown: 'blocker' },
    { label: 'formula', input: '=1+1', shown: '2' },
  ])('setCellInput($label) on a spill target lands and withdraws the array', async (c) => {
    const backend = await spilledBackend()
    await write(backend, 1, c.input)

    expect(await backendColumn(backend)).toEqual(withdrawn(1, c.shown))
    backend.dispose()
  })

  test('setCellInput("") is lazy over a live spill, and revives a withdrawn array', async () => {
    const backend = await spilledBackend()

    // Lazy over a LIVE spill: clearing a ghost cell changes nothing.
    await write(backend, 1, '')
    expect(await backendColumn(backend)).toEqual(SPILLED)

    // …but the same empty input over a REAL blocker removes it, and the
    // array comes back through the host port too.
    await write(backend, 1, 'blocker')
    expect(await backendColumn(backend)).toEqual(withdrawn(1, 'blocker'))
    await write(backend, 1, '')
    expect(await backendColumn(backend)).toEqual(SPILLED)
    backend.dispose()
  })
})
