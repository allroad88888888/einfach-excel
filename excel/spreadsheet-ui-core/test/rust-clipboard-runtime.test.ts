import { afterEach, describe, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustWasmModule, WasmWorkbook } from '../src/rust-workbook/wasm-types'

afterEach(() => vi.unstubAllGlobals())

async function runtime() {
  let onMessage: (event: { data: unknown }) => Promise<void>
  const posted = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_type: string, callback: typeof onMessage) => {
      onMessage = callback
    },
    postMessage: posted,
  })
  const capture = vi.fn((_sheet, _r0, _c0, _r1, _c1, cut: boolean) => ({
    text: '123',
    rows: 1,
    cols: 1,
    cut,
  }))
  const paste = vi.fn<NonNullable<WasmWorkbook['paste_clipboard']>>(() => [0, 0, 0, 0])
  class TestWorkbook {
    rename_sheet() {
      return true
    }

    sheet_name() {
      return 'Test'
    }

    capture_clipboard = capture
    paste_clipboard = paste
    read_sparse_range() {
      return []
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }

    snapshotCell() {
      return { display: '', formula: '', type: 'null' }
    }
  }
  installRustWorkbookRuntime({
    default: async () => {},
    WasmWorkbook: TestWorkbook,
  } as RustWasmModule)
  const call = async (command: string, payload: unknown) => {
    await onMessage({ data: { id: posted.mock.calls.length + 1, command, payload } })
    return posted.mock.lastCall?.[0]
  }
  await call('workbook.initialize', { sheets: [{ id: 'orders', name: 'Test' }] })
  const captureInput = {
    sheetId: 'orders',
    range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    cut: true,
  }
  const pasteInput = (token: string) => ({
    request: {
      sheetId: 'orders',
      requestId: 9,
      row: 0,
      col: 0,
      text: '123',
      token,
      rowCount: 10,
      colCount: 10,
    },
    projection: {
      kind: 'visible-window',
      sheetId: 'orders',
      requestId: 9,
      window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
      reason: 'toolbar',
    },
  })
  return { call, capture, paste, captureInput, pasteInput }
}

describe('Rust clipboard transport', () => {
  test('forwards paste mode and selection unchanged to the Rust policy', async () => {
    const { call, paste, pasteInput } = await runtime()
    const input = pasteInput('external')
    const selection = { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 2 }
    await call('clipboard.paste', {
      ...input,
      request: { ...input.request, mode: 'values', selection },
    })
    expect(paste.mock.calls[0][5]).toMatchObject({ mode: 'values', selection })
  })
  test('capture reads Rust once and cut token is consumed only after successful paste', async () => {
    const { call, capture, paste, captureInput, pasteInput } = await runtime()
    const captured = await call('clipboard.capture', captureInput)
    expect(capture).toHaveBeenCalledWith(0, 0, 0, 0, 0, true)
    const result = await call('clipboard.paste', pasteInput(captured.result.token))
    expect(result.ok).toBe(true)
    expect(result.result.acknowledgement.revision).toBe(1)
    expect(result.result.projection.revision).toBe(1)
    expect(paste.mock.calls[0][4]).toBe(true)
    const repeated = await call('clipboard.paste', pasteInput(captured.result.token))
    expect(repeated.ok).toBe(false)
    expect(repeated.error.message).toBe('CLIPBOARD_CUT_CONSUMED')
    expect(paste).toHaveBeenCalledTimes(1)
  })

  test('a rejected cut paste retains the snapshot for the next attempt', async () => {
    const { call, paste, captureInput, pasteInput } = await runtime()
    const captured = await call('clipboard.capture', captureInput)
    paste.mockImplementationOnce(() => {
      throw new Error('CLIPBOARD_SPILL_TARGET')
    })
    expect((await call('clipboard.paste', pasteInput(captured.result.token))).ok).toBe(false)
    const result = await call('clipboard.paste', pasteInput(captured.result.token))
    expect(result.result.acknowledgement.revision).toBe(1)
    expect(paste.mock.calls[1][4]).toBe(true)
  })

  test('foreign clipboard token uses external TSV instead of another workbook snapshot', async () => {
    const { call, paste, captureInput, pasteInput } = await runtime()
    await call('clipboard.capture', { ...captureInput, cut: false })
    await call('clipboard.paste', pasteInput('another-worker-token'))
    expect(paste.mock.calls[0][4]).toBe(false)
  })

  test('mismatched projection sheet rejects before calling the mutation', async () => {
    const { call, paste, pasteInput } = await runtime()
    const input = pasteInput('unused')
    input.projection.sheetId = 'other'
    expect((await call('clipboard.paste', input)).ok).toBe(false)
    expect(paste).not.toHaveBeenCalled()
  })
})
