import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { EmptyAsyncFormulaWorkbook } from './next-version-integration/empty-async-workbook'
import type { NativeNamedRange, NativeNamedRangeAction } from '../src/named-ranges/native-types'

afterEach(() => vi.unstubAllGlobals())
const projection = {
  kind: 'visible-window', sheetId: 'view', requestId: 2,
  window: { rowStart: 0, colStart: 0, rowEnd: 9, colEnd: 7 },
} as const
const input = {
  sheetId: 'view', revision: 0, projection,
  action: { kind: 'create', name: 'Sales', target: { sheetId: 'source',
    range: { rowStart: 1, colStart: 2, rowEnd: 8, colEnd: 3 } } },
} as const

async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn(), read = vi.fn(() => []), begin = vi.fn()
  const names: NativeNamedRange[] = [{ name: 'Sales', target: { sheet: 1, range: [1, 2, 8, 3] } }]
  const change = vi.fn((_sheet: number, _action: NativeNamedRangeAction) => true)
  const list = vi.fn(() => names)
  vi.stubGlobal('self', {
    location: { origin: 'http://localhost' },
    addEventListener: (_: string, fn: typeof receive) => { receive = fn }, postMessage: post,
  })
  class TestWorkbook extends EmptyAsyncFormulaWorkbook {
    rename_sheet() { return true }
    add_sheet() { return 1 }
    sheet_name(index: number) { return index ? 'Source' : 'View' }
    change_named_range = change
    list_named_ranges = list
    history_begin = begin
    read_sparse_range = read
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', { sheets: [
    { id: 'view', name: 'View', rowCount: 100, colCount: 8 },
    { id: 'source', name: 'Source', rowCount: 100, colCount: 8 },
  ] })
  return { call, change, list, names, read, begin }
}

test('create maps source identity and returns one projection with the native registry', async () => {
  const { call, change, list, read, begin, names } = await setup()
  const result = await call('namedRange.change', input)
  expect(result).toMatchObject({ ok: true, result: {
    changed: true, projection: { revision: 1, sheetId: 'view', namedRanges: names },
  } })
  expect(change).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledWith(0,
    { kind: 'create', name: 'Sales', target: { sheet: 1, range: [1, 2, 8, 3] } })
  expect(list).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledTimes(1)
  expect(begin).not.toHaveBeenCalled()
  expect((await call('namedRange.change', input)).ok).toBe(false)
  expect(change).toHaveBeenCalledTimes(1)
})

test.each([
  { kind: 'update', name: 'Sales', newName: '收入' },
  { kind: 'delete', name: 'Sales' },
])('rename-only or delete is not turned into a fake range: $kind', async (action) => {
  const { call, change } = await setup()
  expect((await call('namedRange.change', { ...input, action })).ok).toBe(true)
  expect(change).toHaveBeenCalledWith(0, action)
})

test('errors and native no-ops do not consume a revision', async () => {
  const { call, change } = await setup()
  change.mockImplementationOnce(() => { throw new Error('The name is already in use.') })
  expect((await call('namedRange.change', input)).error.message).toMatch(/already in use/)
  change.mockReturnValueOnce(false)
  expect((await call('namedRange.change', input)).result.projection.revision).toBe(0)
  expect((await call('namedRange.change', input)).result.projection.revision).toBe(1)
})

test('invalid ownership, stale revisions, canvas bounds and projection fail before native writes', async () => {
  const { call, change } = await setup()
  for (const bad of [
    { ...input, revision: 99 },
    { ...input, sheetId: 'source' },
    { ...input, projection: { ...projection, window: { ...projection.window, rowEnd: -1 } } },
    { ...input, action: { ...input.action, target: { ...input.action.target, sheetId: 'missing' } } },
    { ...input, action: { ...input.action, target: { ...input.action.target,
      range: { ...input.action.target.range, rowEnd: 100 } } } },
  ]) expect((await call('namedRange.change', bad)).ok).toBe(false)
  expect(change).not.toHaveBeenCalled()
})

test('ordinary projection reads include names without creating a separate read command', async () => {
  const { call, list, names, change } = await setup()
  expect((await call('projection.readVisible', { request: projection })).result.namedRanges).toEqual(names)
  expect(list).toHaveBeenCalledTimes(1)
  expect(change).not.toHaveBeenCalled()
})
