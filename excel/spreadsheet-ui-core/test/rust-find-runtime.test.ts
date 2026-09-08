import { afterEach, describe, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { NativeFindRequest, NativeReplaceRequest } from '../src/rust-workbook/find-commands'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 0, colStart: 0, rowEnd: 1000, colEnd: 15 }
const projection = { kind: 'visible-window', sheetId: 'orders', requestId: 12, window: range }
const query = { needle: 'old', caseSensitive: false, wholeCell: false, lookIn: 'formulas' }
const targets = [
  { sheetId: 'orders', range },
  { sheetId: 'summary', range },
]
const search = { targets, query, offset: 500, limit: 500 }
const replace = { targets, query, replacement: 'new', expectedRevision: 0, projection }

async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => {
      receive = fn
    },
    postMessage: post,
  })
  const find = vi.fn((_request: NativeFindRequest) => ({
    total: 1200,
    matches: [{ sheet: 1, row: 900, col: 1, start: 2, end: 5 }],
  }))
  const write = vi.fn((_request: NativeReplaceRequest) => ({ cells: 600, occurrences: 1200 }))
  const read = vi.fn(() => [])
  const begin = vi.fn()
  class TestWorkbook {
    names = ['Orders']
    rename_sheet() {
      return true
    }

    sheet_name(index: number) {
      return this.names[index]
    }

    add_sheet(name: string) {
      this.names.push(name)
      return this.names.length - 1
    }

    move_sheet(from: number, to: number) {
      this.names.splice(to, 0, this.names.splice(from, 1)[0]!)
      return true
    }

    find_cells = find
    replace_by_query = write
    read_sparse_range = read
    history_begin = begin
    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }

    snapshot_viewport_sizes() {
      return { rowHeights: [{ rowIndex: 900, heightPx: 60 }], colWidths: [] }
    }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  expect(
    (
      await call('workbook.initialize', {
        sheets: [
          { id: 'orders', name: 'Orders' },
          { id: 'summary', name: 'Summary' },
        ],
      })
    ).ok,
  ).toBe(true)
  return { call, find, write, read, begin }
}

describe('native find and replace transport', () => {
  test('find forwards the full scope and paging once without changing visible data', async () => {
    const { call, find, read } = await runtime()
    expect(await call('workbook.find', search)).toMatchObject({
      ok: true,
      result: {
        total: 1200,
        revision: 0,
        matches: [{ sheetId: 'summary', row: 900, col: 1, start: 2, end: 5 }],
      },
    })
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith({
      query,
      offset: 500,
      limit: 500,
      targets: [
        { ...range, sheet: 0 },
        { ...range, sheet: 1 },
      ],
    })
    expect(read).not.toHaveBeenCalled()
  })

  test('replace all sends the query, not a capped match page, with one native history owner', async () => {
    const { call, write, begin } = await runtime()
    expect(await call('workbook.replace', replace)).toMatchObject({
      ok: true,
      result: {
        cells: 600,
        occurrences: 1200,
        projection: { revision: 1, requestId: 12 },
        sizes: { rowHeights: [{ rowIndex: 900, heightPx: 60 }] },
      },
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith({
      query,
      replacement: 'new',
      targets: [
        { ...range, sheet: 0 },
        { ...range, sheet: 1 },
      ],
    })
    expect(begin).not.toHaveBeenCalled()
    expect((await call('workbook.find', search)).result.revision).toBe(1)
  })

  test('replace current maps stable sheet identity and preserves UTF-16 positions', async () => {
    const { call, write } = await runtime()
    const current = { sheetId: 'summary', row: 900, col: 1, start: 2, end: 5 }
    expect((await call('workbook.replace', { ...replace, current })).ok).toBe(true)
    expect(write.mock.lastCall![0]).toMatchObject({
      current: { sheet: 1, row: 900, col: 1, start: 2, end: 5 },
    })
  })

  test('stale or missing revisions never call the native write', async () => {
    const { call, write } = await runtime()
    await call('workbook.replace', replace)
    write.mockClear()
    for (const expectedRevision of [undefined, -1, 0, NaN, 1.5]) {
      expect((await call('workbook.replace', { ...replace, expectedRevision })).ok).toBe(false)
    }
    expect(write).not.toHaveBeenCalled()
  })

  test('no-op and native rejection leave the revision unchanged', async () => {
    const { call, write } = await runtime()
    write.mockReturnValueOnce({ cells: 0, occurrences: 0 })
    expect((await call('workbook.replace', replace)).result.projection.revision).toBe(0)
    write.mockImplementationOnce(() => {
      throw new Error('INVALID_FORMULA')
    })
    expect(await call('workbook.replace', replace)).toMatchObject({
      ok: false,
      error: { message: 'INVALID_FORMULA' },
    })
    expect((await call('workbook.find', search)).result.revision).toBe(0)
  })

  test('post-write projection failure still invalidates old search results', async () => {
    const { call, write, read } = await runtime()
    read.mockImplementationOnce(() => {
      throw new Error('Projection failed')
    })
    expect((await call('workbook.replace', replace)).ok).toBe(false)
    expect((await call('workbook.find', search)).result.revision).toBe(1)
    expect((await call('workbook.replace', replace)).ok).toBe(false)
    expect(write).toHaveBeenCalledTimes(1)
  })

  test('missing target, current or projection sheet is rejected before native mutation', async () => {
    const { call, write } = await runtime()
    for (const input of [
      { ...replace, targets: [{ sheetId: 'missing', range }] },
      { ...replace, projection: { ...projection, sheetId: 'missing' } },
      { ...replace, current: { sheetId: 'missing', row: 0, col: 0, start: 0, end: 3 } },
    ])
      expect((await call('workbook.replace', input)).ok).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })

  test('moving worksheets remaps query indices without changing stable result IDs', async () => {
    const { call, find } = await runtime()
    expect(
      (
        await call('workbook.changeSheets', {
          operation: 'move',
          sheetId: 'summary',
          targetIndex: 0,
        })
      ).ok,
    ).toBe(true)
    find.mockReturnValueOnce({
      total: 1,
      matches: [{ sheet: 0, row: 2, col: 1, start: 0, end: 3 }],
    })
    const reply = await call('workbook.find', search)
    expect(reply.result.matches[0].sheetId).toBe('summary')
    expect(find.mock.lastCall![0]).toMatchObject({
      targets: [
        { ...range, sheet: 1 },
        { ...range, sheet: 0 },
      ],
    })
    expect(reply.result.revision).toBe(1)
  })
})
