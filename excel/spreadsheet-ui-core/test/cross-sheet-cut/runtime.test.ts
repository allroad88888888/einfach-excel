import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../../src/rust-workbook/runtime'
import type { RustWasmModule, WasmWorkbook } from '../../src/rust-workbook/wasm-types'

afterEach(() => vi.unstubAllGlobals())

async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const posted = vi.fn()
  vi.stubGlobal('self', {
    location: { origin: 'https://workbook.test' },
    addEventListener: (_: string, callback: typeof receive) => { receive = callback },
    postMessage: posted,
  })
  const paste = vi.fn<NonNullable<WasmWorkbook['paste_clipboard']>>(() => [3, 2, 3, 2])
  const finish = vi.fn()
  class NativeWorkbook {
    names = ['Source']
    rename_sheet(index: number, name: string) { this.names[index] = name; return true }
    add_sheet(name: string) { this.names.push(name); return this.names.length - 1 }
    sheet_name(index: number) { return this.names[index] }
    prepare_clipboard = vi.fn(() => ({ text: '4', rows: 1, cols: 1, cut: true }))
    finish_clipboard_capture = finish
    paste_clipboard = paste
    read_sparse_range() { return [] }
    snapshot_format_range() { return { cellStyles: [], rowStyles: [], columnStyles: [] } }
    snapshot_viewport_sizes() { return { rowHeights: [], colWidths: [] } }
    snapshotCell() { return { display: '', formula: '', type: 'null' } }
    registerCustomFormulaAsync() {}
    drainAsyncCustomRequests() { return [] }
    resolveAsyncCustomCall() { return false }
    read_custom_formulas() { return '[]' }
  }
  installRustWorkbookRuntime({
    default: async () => {}, WasmWorkbook: NativeWorkbook,
  } as unknown as RustWasmModule)
  async function call(command: string, payload: unknown) {
    await receive({ data: { id: posted.mock.calls.length + 1, command, payload } })
    return posted.mock.lastCall![0]
  }
  const initialized = await call('workbook.initialize', { sheets: [
    { id: 'source', name: 'Source' }, { id: 'target', name: "Target O'Brien" },
  ] })
  expect(initialized.ok, initialized.error?.message).toBe(true)
  const range = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
  const capture = await call('clipboard.capture', { sheetId: 'source', range, cut: true })
  const token: string = capture.result.token
  const projection = {
    kind: 'visible-window', sheetId: 'target', requestId: 7, reason: 'toolbar',
    window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 4 },
  }
  const payload = {
    request: { sheetId: 'target', requestId: 7, row: 3, col: 2, text: '4', token,
      rowCount: 10, colCount: 5 },
    projection,
  }
  return { call, token, paste, finish, projection, payload }
}

test('XSCUT pending and confirmed cut identity survives target-sheet projection requests', async () => {
  const { call, token, paste, finish, projection, payload } = await setup()
  expect((await call('projection.readVisible', { request: projection })).ok).toBe(true)
  expect((await call('clipboard.finishCapture', { token, commit: true })).ok).toBe(true)
  expect(finish).toHaveBeenCalledExactlyOnceWith(true)
  expect((await call('projection.readVisible', { request: projection })).ok).toBe(true)
  const result = await call('clipboard.paste', payload)
  expect(result.ok).toBe(true)
  expect(paste.mock.calls[0].slice(0, 5)).toEqual([1, 3, 2, '4', true])
  expect(result.result.acknowledgement.revision).toBe(1)
  expect((await call('clipboard.paste', payload)).error.message).toBe('CLIPBOARD_CUT_CONSUMED')
  expect(paste).toHaveBeenCalledTimes(1)
})

test('XSCUT native rejection keeps the same cross-sheet token retryable and advances revision once', async () => {
  const { call, token, paste, payload } = await setup()
  await call('clipboard.finishCapture', { token, commit: true })
  paste.mockImplementationOnce(() => { throw new Error('CLIPBOARD_PARTIAL_REFERENCE_MOVE') })
  expect((await call('clipboard.paste', payload)).error.message).toBe('CLIPBOARD_PARTIAL_REFERENCE_MOVE')
  const result = await call('clipboard.paste', payload)
  expect(result.ok).toBe(true)
  expect(result.result.acknowledgement.revision).toBe(1)
  expect(paste.mock.calls.every((args) => args[4] === true)).toBe(true)
})

test('XSCUT failed external clipboard write never promotes the pending native cut', async () => {
  const { call, token, paste, finish, payload } = await setup()
  await call('clipboard.finishCapture', { token, commit: false })
  expect(finish).toHaveBeenCalledExactlyOnceWith(false)
  await call('clipboard.paste', payload)
  expect(paste.mock.calls[0][4]).toBe(false)
})
