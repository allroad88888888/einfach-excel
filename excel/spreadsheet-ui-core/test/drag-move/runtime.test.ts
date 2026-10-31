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
  const transfer = vi.fn<NonNullable<WasmWorkbook['drag_transfer_range']>>(() => [5, 3, 6, 4])
  const prepare = vi.fn()
  class NativeWorkbook {
    names = ['Drag']
    rename_sheet(index: number, name: string) { this.names[index] = name; return true }
    add_sheet(name: string) { this.names.push(name); return this.names.length - 1 }
    sheet_name(index: number) { return this.names[index] }
    drag_transfer_range = transfer
    prepare_clipboard = prepare
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
  const initialized = await call('workbook.initialize', {
    sheets: [{ id: 'drag', name: 'Drag', rowCount: 20, colCount: 8 }],
  })
  expect(initialized.ok, initialized.error?.message).toBe(true)
  return { call, transfer, prepare }
}

const projection = {
  kind: 'visible-window', sheetId: 'drag', requestId: 3, reason: 'toolbar',
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
}
const request = {
  sheetId: 'drag', requestId: 3, source: { rowStart: 1, colStart: 1, rowEnd: 2, colEnd: 2 },
  target: { row: 5, col: 3 }, copy: false, replace: false,
}

test('range.dragTransfer forwards one native call and acknowledges the written range', async () => {
  const { call, transfer, prepare } = await setup()
  const result = await call('range.dragTransfer', { request, projection })
  expect(result.ok, result.error?.message).toBe(true)
  expect(transfer).toHaveBeenCalledExactlyOnceWith(0, 1, 1, 2, 2, 5, 3, false, false, 20, 8)
  expect(prepare).not.toHaveBeenCalled()
  expect(result.result.acknowledgement).toEqual({
    sheetId: 'drag', requestId: 3, revision: 1,
    affectedRange: { rowStart: 5, colStart: 3, rowEnd: 6, colEnd: 4 },
  })
  expect(result.result.projection.revision).toBe(1)
})

test('range.dragTransfer passes native rejections through without advancing the revision',
  async () => {
    const { call, transfer } = await setup()
    transfer.mockImplementationOnce(() => { throw new Error('DRAG_TARGET_NOT_EMPTY') })
    expect((await call('range.dragTransfer', { request, projection })).error.message)
      .toBe('DRAG_TARGET_NOT_EMPTY')
    const retried = await call('range.dragTransfer', {
      request: { ...request, replace: true }, projection,
    })
    expect(retried.result.acknowledgement.revision).toBe(1)
    expect(transfer.mock.lastCall?.[8]).toBe(true)
  })
