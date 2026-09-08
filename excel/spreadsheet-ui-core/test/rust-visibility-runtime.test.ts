import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 1 }
const projection = { kind: 'visible-window', sheetId: 'orders', requestId: 8, window: range }
const payload = { sheetId: 'orders', range, action: 'hide-rows', projection }
const visibility = { manualRows: [900], manualColumns: [7], filterRows: [800] }

/** Only spies on native calls; hidden-set calculation belongs to the Rust tests. */
async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => {
      receive = fn
    },
    postMessage: post,
  })
  const change = vi.fn(() => true)
  const clear = vi.fn()
  const apply = vi.fn(() => true)
  const visible = vi.fn((index: number) =>
    index === 0 ? visibility : { manualRows: [9], manualColumns: [6], filterRows: [] },
  )
  class TestWorkbook {
    rename_sheet() {
      return true
    }

    add_sheet() {
      return 1
    }

    sheet_name(index: number) {
      return index === 0 ? 'Orders' : 'Summary'
    }

    set_visibility = change
    sheet_visibility = visible
    history_clear = clear
    history_apply = apply
    history_state() {
      return {
        undoCount: 1,
        redoCount: 0,
        notice: null,
        entries: [{ label: 'Hide rows', sheetIndex: 0, range }],
      }
    }

    read_sparse_range() {
      return []
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }

    snapshot_viewport_sizes() {
      return { rowHeights: [], colWidths: [] }
    }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, input: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload: input } })
    return post.mock.lastCall![0]
  }
  expect(
    (
      await call('workbook.initialize', {
        sheets: [
          { id: 'orders', name: 'Orders', rowCount: 1001, colCount: 16 },
          {
            id: 'summary',
            name: 'Summary',
            rowCount: 100,
            colCount: 8,
            hiddenRows: [9],
            hiddenColumns: [6],
          },
        ],
      })
    ).ok,
  ).toBe(true)
  return { call, change, clear, apply, visible }
}

test('initial hidden metadata reaches Rust before initialization history is cleared', async () => {
  const { change, clear } = await setup()
  expect(change.mock.calls).toEqual([
    [1, 9, 0, 9, 0, 'hide-rows'],
    [1, 0, 6, 0, 6, 'hide-columns'],
  ])
  expect(clear.mock.calls).toEqual([['']])
  expect(clear.mock.invocationCallOrder[0]).toBeGreaterThan(change.mock.invocationCallOrder[1]!)
})

test.each(['hide-rows', 'hide-columns', 'unhide'])(
  '%s returns the full native sheet visibility in the same response',
  async (action) => {
    const { call, change } = await setup()
    change.mockClear()
    const reply = await call('range.visibility', { ...payload, action })
    expect(change.mock.calls).toEqual([[0, 1, 0, 3, 1, action]])
    expect(reply).toMatchObject({
      ok: true,
      result: { changed: true, projection: { ...projection, revision: 1, visibility } },
    })
    // Offscreen hidden indices are metadata, not truncated to the requested cell window.
    expect(reply.result.projection.visibility.manualRows).toEqual([900])
  },
)

test('no-op and rejected native changes do not advance the revision', async () => {
  const { call, change } = await setup()
  change.mockReturnValueOnce(false)
  expect((await call('range.visibility', payload)).result).toMatchObject({
    changed: false,
    projection: { revision: 0 },
  })
  change.mockImplementationOnce(() => {
    throw new Error('Native rejection')
  })
  expect((await call('range.visibility', payload)).error.message).toBe('Native rejection')
  expect((await call('projection.readVisible', { request: projection })).result.revision).toBe(0)
})

test('invalid bounds and sheet correlation cannot invoke a native mutation', async () => {
  const { call, change } = await setup()
  change.mockClear()
  for (const invalid of [
    { ...range, rowStart: -1 },
    { ...range, rowEnd: 1.5 },
    { ...range, rowEnd: 1001 },
    { ...range, colEnd: 16 },
    { ...range, rowStart: 4 },
    { ...range, colStart: 2 },
    { ...range, rowEnd: NaN },
    { ...range, rowEnd: Infinity },
    { rowStart: 1, rowEnd: 3, colStart: 0 },
  ])
    expect((await call('range.visibility', { ...payload, range: invalid })).ok).toBe(false)
  expect((await call('range.visibility', { ...payload, sheetId: 'missing' })).ok).toBe(false)
  expect(
    (
      await call('range.visibility', {
        ...payload,
        projection: { ...projection, sheetId: 'summary' },
      })
    ).ok,
  ).toBe(false)
  expect(change).not.toHaveBeenCalled()
})

test('undo on another sheet returns separate target and visible-sheet metadata', async () => {
  const { call, apply } = await setup()
  const reply = await call('history.apply', {
    direction: 'undo',
    projection: { ...projection, sheetId: 'summary' },
  })
  expect(apply.mock.calls).toEqual([['undo']])
  expect(reply).toMatchObject({
    ok: true,
    result: {
      sheetId: 'orders',
      visibility,
      projection: {
        sheetId: 'summary',
        visibility: { manualRows: [9], manualColumns: [6], filterRows: [] },
      },
    },
  })
})
