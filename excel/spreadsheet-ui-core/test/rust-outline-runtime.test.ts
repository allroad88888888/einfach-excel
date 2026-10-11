import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustWorkbookSheetInput } from '../src/rust-workbook/commands'

afterEach(() => vi.unstubAllGlobals())
async function setup(outline?: RustWorkbookSheetInput['outline']) {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn(),
    change = vi.fn(() => true),
    clear = vi.fn(),
    read = vi.fn(() => [])
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => {
      receive = fn
    },
    postMessage: post,
  })
  class TestWorkbook {
    rename_sheet() {
      return true
    }

    sheet_name() {
      return 'Test'
    }

    change_outline = change
    history_clear = clear
    read_sparse_range = read
    sheet_visibility() {
      return {
        manualRows: [],
        manualColumns: [],
        filterRows: [],
        outline: { rows: [{ start: 1, end: 3, collapsed: false }], columns: [] },
      }
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', {
    sheets: [{ id: 's', name: 'Test', rowCount: 100, colCount: 8, outline }],
  })
  return { call, change, clear, read }
}
const input = {
  sheetId: 's',
  axis: 'row',
  revision: 0,
  action: { kind: 'group', start: 1, end: 3 },
  projection: {
    kind: 'visible-window',
    sheetId: 's',
    requestId: 2,
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
  },
}

test('native mutation advances one revision and returns one visible projection', async () => {
  const { call, change, read } = await setup()
  const result = await call('outline.change', input)
  expect(result.ok).toBe(true)
  expect(change).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledWith(0, 'row', input.action)
  expect(read).toHaveBeenCalledTimes(1)
  expect(result.result.projection).toMatchObject({
    revision: 1,
    visibility: { outline: { rows: [{ start: 1, end: 3, collapsed: false }] } },
  })
  const stale = await call('outline.change', input)
  expect(stale.ok).toBe(false)
  expect(change).toHaveBeenCalledTimes(1)
})

test('transport rejects cross-sheet, invalid canvas and axis before native writes', async () => {
  const { call, change } = await setup()
  for (const bad of [
    { ...input, projection: { ...input.projection, sheetId: 'elsewhere' } },
    { ...input, axis: 'depth' },
    { ...input, action: { kind: 'group', start: 1, end: 100 } },
    { ...input, axis: 'column', action: { kind: 'group', start: 1, end: 8 } },
  ])
    expect((await call('outline.change', bad)).ok).toBe(false)
  expect(change).not.toHaveBeenCalled()
})

test('initial groups are sorted before applying collapsed indices and history is cleared', async () => {
  const { change, clear } = await setup({
    rows: [
      { start: 2, end: 3, collapsed: true },
      { start: 1, end: 4, collapsed: false },
    ],
    columns: [],
  })
  expect(change.mock.calls).toEqual([
    [0, 'row', { kind: 'group', start: 1, end: 4 }],
    [0, 'row', { kind: 'group', start: 2, end: 3 }],
    [0, 'row', { kind: 'set-collapsed', index: 1, collapsed: true }],
  ])
  expect(clear).toHaveBeenCalledWith('')
})
