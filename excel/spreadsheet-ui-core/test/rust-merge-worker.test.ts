import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 }
const projection = {
  kind: 'visible-window',
  sheetId: 's',
  requestId: 1,
  reason: 'toolbar',
  window: range,
}

async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    postMessage: post,
    addEventListener: (_: string, callback: typeof receive) => {
      receive = callback
    },
  })
  let geometry: number[] = []
  let undoCount = 0
  const merge = vi.fn((...args: unknown[]) => {
    geometry = args[5] === 'unmerge' ? [] : [0, 0, 1, 1]
    undoCount += 1
    return true
  })
  const read = vi.fn(() => [])
  class Native {
    rename_sheet() {}
    sheet_name() {
      return 'Sheet'
    }

    merge_cells = merge
    merged_ranges() {
      return geometry
    }

    read_sparse_range = read
    snapshotCell() {
      return { sheet: 0, addr: 'A1', type: 'number', display: '4', formula: '', isError: false }
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }

    history_state() {
      return { undoCount, redoCount: 0, entries: [], notice: null }
    }
  }
  installRustWorkbookRuntime({
    default: async () => {},
    WasmWorkbook: Native,
  } as unknown as RustWasmModule)
  const call = async (command: string, payload: unknown) => {
    const id = post.mock.calls.length + 1
    await receive({ data: { id, command, payload } })
    expect(post).toHaveBeenCalledTimes(id)
    expect(post.mock.lastCall![0].id).toBe(id)
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [{ id: 's', name: 'Sheet' }] })
  const execute = (action: string, discard = false, sheetId = 's') =>
    call('range.merge', {
      sheetId,
      range,
      action,
      discard,
      projection,
    })
  return { call, execute, merge, read }
}

test.each(['merge', 'center', 'unmerge'])(
  '%s uses one native command and one projection reply',
  async (action) => {
    const r = await setup()
    const response = await r.execute(action, true)
    expect(response).toMatchObject({
      ok: true,
      result: {
        changed: true,
        projection: { sheetId: 's', requestId: 1, revision: 1, history: { undoCount: 1 } },
      },
    })
    expect(r.merge).toHaveBeenCalledTimes(1)
    expect(r.merge).toHaveBeenCalledWith(0, 0, 0, 1, 1, action, true)
    expect(r.read).toHaveBeenCalledTimes(1)
    expect(response.result.projection.mergedRanges).toEqual(action === 'unmerge' ? [] : [range])
    if (action !== 'unmerge')
      expect(response.result.projection.mergeAnchors).toMatchObject([
        { row: 0, col: 0, displayValue: '4', mergedSpan: { rows: 2, cols: 2 } },
      ])
  },
)

test('confirmation rejection neither reads a projection nor advances revision', async () => {
  const r = await setup()
  r.merge.mockImplementationOnce(() => {
    throw 'MERGE_CONTENT_CONFIRMATION_REQUIRED'
  })
  expect(await r.execute('center')).toMatchObject({
    ok: false,
    error: {
      message: 'MERGE_CONTENT_CONFIRMATION_REQUIRED',
    },
  })
  expect(r.read).not.toHaveBeenCalled()
  const before = await r.call('projection.readVisible', { request: projection })
  expect(before.result.revision).toBe(0)
  expect((await r.execute('center', true)).result.projection.revision).toBe(1)
})

test('no-op merge preserves revision', async () => {
  const r = await setup()
  r.merge.mockReturnValueOnce(false)
  expect(await r.execute('unmerge')).toMatchObject({
    ok: true,
    result: {
      changed: false,
      projection: { revision: 0 },
    },
  })
  expect((await r.execute('merge')).result.projection.revision).toBe(1)
})

test('unknown sheet or mismatching projection is rejected before native mutation', async () => {
  const r = await setup()
  expect((await r.execute('merge', false, 'missing')).ok).toBe(false)
  expect(
    await r.call('range.merge', {
      sheetId: 's',
      range,
      action: 'merge',
      discard: false,
      projection: { ...projection, sheetId: 'another' },
    }),
  ).toMatchObject({ ok: false, error: { message: 'PROJECTION_SHEET_MISMATCH' } })
  expect(r.merge).not.toHaveBeenCalled()
})
