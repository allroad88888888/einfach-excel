import { afterEach, expect, test, vi } from 'vitest'
import { inspectSpill } from '../src/rust-workbook/spill-commands'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

function workbook() {
  return { spillAnchor: vi.fn((): string | null => 'B3'),
    spillInfo: vi.fn((): Uint32Array | null => new Uint32Array([3, 2])),
    spillBlocker: vi.fn((): string | null => null),
    read_sparse_range: vi.fn(() => [{ sheet: 0, addr: 'B4', display: '3', type: 'number', isError: false }]),
  }
}
test('native anchor query resolves a child outside the visible window using one sparse cell read', () => {
  const book = workbook()
  expect(inspectSpill(book, 0, { row: 3, col: 1 })).toEqual({ kind: 'active',
    anchor: { row: 2, col: 1 }, range: { rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 2 } })
  expect(book.read_sparse_range).toHaveBeenCalledOnce()
  expect(book.read_sparse_range).toHaveBeenCalledWith(0, 3, 1, 3, 1)
  expect(book.spillInfo).toHaveBeenCalledWith(0, 'B3')
  expect(book.spillBlocker).not.toHaveBeenCalled()
})
test('single-cell native arrays stay arrays in inspection', () => {
  const book = workbook()
  book.spillAnchor.mockReturnValue(null)
  book.spillInfo.mockReturnValue(new Uint32Array([1, 1]))
  expect(inspectSpill(book, 0, { row: 3, col: 1 })).toMatchObject({ kind: 'active',
    range: { rowStart: 3, rowEnd: 3, colStart: 1, colEnd: 1 } })
})
test('native error is distinct from literal #SPILL!; unidentified blockers are not invented', () => {
  const book = workbook()
  book.spillInfo.mockReturnValue(null)
  book.spillAnchor.mockReturnValue(null)
  book.read_sparse_range.mockReturnValue([{ sheet: 0, addr: 'B4', display: '#SPILL!', type: 'text', isError: false }])
  expect(inspectSpill(book, 0, { row: 3, col: 1 })).toEqual({ kind: 'none' })
  book.read_sparse_range.mockReturnValue([{ sheet: 0, addr: 'B4', display: '#SPILL!', type: 'error', isError: true }])
  expect(inspectSpill(book, 0, { row: 3, col: 1 })).toEqual({ kind: 'blocked', anchor: { row: 3, col: 1 }, blocker: null })
  book.spillBlocker.mockReturnValue('C5')
  expect(inspectSpill(book, 0, { row: 3, col: 1 })).toMatchObject({ blocker: { row: 4, col: 2 } })
})
test('invalid geometry, unavailable API and invalid input do not fabricate results', () => {
  const book = workbook()
  expect(() => inspectSpill(book, 0, { row: -1, col: 0 })).toThrow('Invalid spill cell')
  expect(book.read_sparse_range).not.toHaveBeenCalled()
  expect(() => inspectSpill({}, 0, { row: 0, col: 0 })).toThrow('unavailable')
  book.spillInfo.mockReturnValue(new Uint32Array([0, 1]))
  expect(() => inspectSpill(book, 0, { row: 3, col: 1 })).toThrow('invalid spill range')
})

afterEach(() => vi.unstubAllGlobals())
test('Worker dispatch uses the selected sheet and does not advance history or revision', async () => {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', { addEventListener: (_: string, callback: typeof receive) => { receive = callback }, postMessage: post })
  const queries = workbook()
  class Book {
    rename_sheet = () => true
    sheet_name = () => 'Sheet'
    spillAnchor = queries.spillAnchor
    spillInfo = queries.spillInfo
    spillBlocker = queries.spillBlocker
    read_sparse_range = queries.read_sparse_range
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: Book })
  await receive({ data: { id: 1, command: 'workbook.initialize', payload: { sheets: [{ id: 's', name: 'Sheet' }] } } })
  await receive({ data: { id: 2, command: 'formula.inspectSpill', payload: { sheetId: 's', cell: { row: 3, col: 1 } } } })
  expect(post.mock.lastCall![0]).toMatchObject({ ok: true, result: { revision: 0, inspection: { kind: 'active' } } })
  expect(queries.spillAnchor).toHaveBeenCalledWith(0, 'B4')
  await receive({ data: { id: 3, command: 'formula.inspectSpill', payload: { sheetId: 'missing', cell: { row: 3, col: 1 } } } })
  expect(post.mock.lastCall![0]).toMatchObject({ ok: false })
})
