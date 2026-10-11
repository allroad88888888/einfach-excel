import { expect, test, vi } from 'vitest'
import { exportWorkbookFile, openWorkbookFile } from '../src/rust-workbook/file-io'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

const snapshot = { version: 1, sheets: [{ idx: 0, name: 'Restored' }],
  cells: [{ sheet: 0, row: 0, col: 0, kind: 'text', value: '你好' }],
  conditionalFormats: [{ rules: [{ kind: 'text', stopIfTrue: true }] }] }
const canvas = { rowCount: 1001, colCount: 30 }
const file = (patch = {}) => JSON.stringify({ format: 'einfach-workbook', version: 1,
  title: 'My book', canvases: [canvas], workbook: snapshot, ...patch })
function setup() {
  const restore = vi.fn()
  const free = vi.fn()
  class Workbook {
    restore_persistence_v1 = restore
    snapshot_persistence_v1 = () => snapshot
    sheet_count = () => 1
    sheet_name = () => 'Restored'
    sheet_key = () => 'rust-key'
    free = free
  }
  return { wasm: { default: async () => {}, WasmWorkbook: Workbook }, restore, free,
    book: new Workbook() as unknown as WasmWorkbook }
}

test('file wraps the unchanged native snapshot plus view canvas and a safe filename', () => {
  const { book } = setup()
  const exported = exportWorkbookFile(book, [{ id: 's', index: 0, name: 'Before', ...canvas }], 'Q1/你好')
  expect(exported.filename).toBe('Q1_你好.einfach.json')
  expect(JSON.parse(exported.text)).toEqual(JSON.parse(file({ title: 'Q1/你好' })))
})

test('restore delegates workbook validation once and gets names/keys from Rust, not UI metadata', () => {
  const { wasm, restore, free } = setup()
  const opened = openWorkbookFile(wasm, file(), 'session-2')
  expect(restore).toHaveBeenCalledOnce()
  expect(restore).toHaveBeenCalledWith(snapshot)
  expect(opened.metadata).toEqual({ title: 'My book', sheets: [{
    ...canvas, id: 'session-2-0', index: 0, name: 'Restored', key: 'rust-key',
  }] })
  expect(free).not.toHaveBeenCalled()
})

test.each([
  '{', '{}', file({ version: 2 }), file({ format: 'xlsx' }), file({ title: '' }),
  file({ title: 'a'.repeat(257) }), file({ canvases: [] }),
  file({ canvases: [{ rowCount: 0, colCount: 3 }] }),
  file({ canvases: [{ rowCount: 1_048_577, colCount: 3 }] }),
  file({ canvases: [{ rowCount: 10, colCount: 16_385 }] }),
  file({ canvases: [{ rowCount: 1.5, colCount: 3 }] }),
])('rejects invalid envelopes before touching Rust: %#', (text) => {
  const { wasm, restore } = setup()
  expect(() => openWorkbookFile(wasm, text, 's')).toThrow()
  expect(restore).not.toHaveBeenCalled()
})

test('native rejection frees only the candidate and preserves the error', () => {
  const { wasm, restore, free } = setup()
  restore.mockImplementation(() => { throw new Error('invalid-native-formula') })
  expect(() => openWorkbookFile(wasm, file(), 's')).toThrow('invalid-native-formula')
  expect(free).toHaveBeenCalledOnce()
})

test('a mismatched canvas count frees the candidate after native validation', () => {
  const { wasm, free } = setup()
  expect(() => openWorkbookFile(wasm, file({ canvases: [canvas, canvas] }), 's')).toThrow(/mismatched/)
  expect(free).toHaveBeenCalledOnce()
})

test('export rejects stale sheet metadata and does not invent empty content', () => {
  const { book } = setup()
  expect(() => exportWorkbookFile(book, [], 'Book')).toThrow(/out of date/)
  expect(() => exportWorkbookFile(book, [{ id: 'x', index: 1, name: 'X' }], 'Book')).toThrow(/out of date/)
})
