import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { EmptyAsyncFormulaWorkbook } from './next-version-integration/empty-async-workbook'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 1 }
const projection = {
  kind: 'visible-window',
  sheetId: 's',
  requestId: 1,
  reason: 'toolbar',
  window: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 },
}

async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    location: { origin: 'http://localhost' },
    postMessage: post,
    addEventListener: (_: string, callback: typeof receive) => {
      receive = callback
    },
  })
  const shift = vi.fn((..._args: unknown[]) => true)
  class Native extends EmptyAsyncFormulaWorkbook {
    rename_sheet() {}
    sheet_name() {
      return 'Sheet'
    }

    shift_cells = shift
    read_sparse_range() {
      return []
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }
  }
  installRustWorkbookRuntime({
    default: async () => {},
    WasmWorkbook: Native,
  } as unknown as RustWasmModule)
  const call = async (command: string, payload: unknown) => {
    const id = post.mock.calls.length + 1
    await receive({ data: { id, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 's', name: 'Sheet' }] })
  return { call, shift }
}

test('shift cells forwards one native call and advances the projection revision', async () => {
  const r = await setup()
  const response = await r.call('range.shiftCells', {
    sheetId: 's',
    range,
    direction: 'delete-up',
    projection,
  })
  expect(response).toMatchObject({
    ok: true,
    result: { changed: true, projection: { revision: 1 } },
  })
  expect(r.shift).toHaveBeenCalledWith(0, 1, 1, 2, 1, 'delete-up')
})

test('native rejection or projection mismatch reports an error without advancing', async () => {
  const r = await setup()
  r.shift.mockImplementationOnce(() => {
    throw 'Cannot shift part of a spilled array.'
  })
  const rejected = await r.call('range.shiftCells', {
    sheetId: 's', range, direction: 'insert-right', projection,
  })
  expect(rejected).toMatchObject({
    ok: false,
    error: { message: 'Cannot shift part of a spilled array.' },
  })
  const mismatch = await r.call('range.shiftCells', {
    sheetId: 's', range, direction: 'insert-right', projection: { ...projection, sheetId: 'x' },
  })
  expect(mismatch.ok).toBe(false)
  const read = await r.call('projection.readVisible', { request: projection })
  expect(read.result.revision).toBe(0)
})
