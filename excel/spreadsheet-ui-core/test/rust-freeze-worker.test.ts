import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'
import { validateProjectionResult } from '../src/projection/contracts'

afterEach(() => vi.unstubAllGlobals())
const projection = {
  kind: 'visible-window',
  sheetId: 's',
  requestId: 1,
  window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 5 },
} as const

async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    postMessage: post,
    addEventListener: (_: string, callback: typeof receive) => {
      receive = callback
    },
  })
  let frozen = [0, 0]
  const freeze = vi.fn((_sheet: number, rows: number, cols: number) => {
    const changed = frozen[0] !== rows || frozen[1] !== cols
    frozen = [rows, cols]
    return changed
  })
  const read = vi.fn(() => [])
  class Native {
    rename_sheet() {}

    sheet_name() {
      return 'Sheet'
    }

    set_frozen_panes = freeze
    frozen_panes = () => frozen
    read_sparse_range = read
    snapshot_format_range = () => ({ cellStyles: [], rowStyles: [], columnStyles: [] })
  }
  installRustWorkbookRuntime({
    default: async () => {},
    WasmWorkbook: Native,
  } as unknown as RustWasmModule)
  const call = async (command: string, payload: unknown) => {
    const id = post.mock.calls.length + 1
    await receive({ data: { id, command, payload } })
    expect(post.mock.lastCall![0].id).toBe(id)
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', {
    sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  const run = (rows: number, cols: number) =>
    call('sheet.freeze', { sheetId: 's', rows, cols, projection })
  return { call, run, freeze, read }
}

test('freeze returns one native mutation and one matching projection; no-op retains revision', async () => {
  const r = await setup()
  expect(await r.run(3, 2)).toMatchObject({
    ok: true,
    result: {
      changed: true,
      projection: { freeze: { rows: 3, cols: 2 }, revision: 1, requestId: 1 },
    },
  })
  expect(r.freeze).toHaveBeenCalledWith(0, 3, 2)
  expect(r.read).toHaveBeenCalledTimes(1)
  expect((await r.run(3, 2)).result).toMatchObject({ changed: false, projection: { revision: 1 } })
  expect((await r.run(0, 0)).result.projection).toMatchObject({
    freeze: { rows: 0, cols: 0 },
    revision: 2,
  })
})

test.each([
  [-1, 0],
  [1.5, 0],
  [NaN, 0],
  [100, 0],
  [0, 8],
])('invalid freeze %j is rejected before writing', async (rows, cols) => {
  const r = await setup()
  expect((await r.run(rows, cols)).ok).toBe(false)
  expect(r.freeze).not.toHaveBeenCalled()
  expect(r.read).not.toHaveBeenCalled()
})

test('wrong sheet or projection cannot mutate the active sheet', async () => {
  const r = await setup()
  for (const input of [
    { sheetId: 'missing', rows: 1, cols: 0, projection },
    { sheetId: 's', rows: 1, cols: 0, projection: { ...projection, sheetId: 'other' } },
  ])
    expect((await r.call('sheet.freeze', input)).ok).toBe(false)
  expect(r.freeze).not.toHaveBeenCalled()
})

test('native failure does not publish a projection or advance revision', async () => {
  const r = await setup()
  r.freeze.mockImplementationOnce(() => {
    throw new Error('Native rejected freeze')
  })
  expect(await r.run(1, 0)).toMatchObject({
    ok: false,
    error: { message: 'Native rejected freeze' },
  })
  expect(r.read).not.toHaveBeenCalled()
  expect((await r.run(1, 0)).result.projection.revision).toBe(1)
})

test('invalid viewport is rejected before freezing or clearing native history', async () => {
  const r = await setup()
  const result = await r.call('sheet.freeze', {
    sheetId: 's', rows: 1, cols: 0,
    projection: {
      ...projection,
      viewport: { height: Infinity, width: 600, rowHeight: 28, colWidth: 120 },
    },
  })
  expect(result).toMatchObject({ ok: false, error: { message: 'Invalid projection viewport.' } })
  expect(r.freeze).not.toHaveBeenCalled()
  expect(r.read).not.toHaveBeenCalled()
})

test.each([null, {}, { rows: -1, cols: 0 }, { rows: 1, cols: 1.5 }, { rows: 1_048_576, cols: 0 }])(
  'malformed freeze metadata cannot be published: %j',
  (freeze) => {
    expect(validateProjectionResult({ ...projection, cells: [], freeze } as never).ok).toBe(false)
  },
)
