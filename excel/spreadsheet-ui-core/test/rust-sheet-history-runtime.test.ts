import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'
import type { RustHistoryState } from '../src/history/rust-history-types'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
const projection = {
  kind: 'visible-window',
  sheetId: 'summary',
  requestId: 8,
  reason: 'toolbar',
  window: range,
}

async function setup() {
  let message!: (event: { data: unknown }) => Promise<void>
  const posted = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof message) => {
      message = fn
    },
    postMessage: posted,
  })
  let sheets = [{ key: '1', name: 'Orders' }]
  let state: RustHistoryState = { undoCount: 0, redoCount: 0, entries: [], notice: null }
  const apply = vi.fn(() => true)
  const paste = vi.fn(() => [0, 0, 0, 0])
  class Native {
    rename_sheet(index: number, name: string) {
      sheets[index]!.name = name
    }

    add_sheet(name: string) {
      sheets.push({ key: String(sheets.length + 1), name })
    }

    edit_sheet(index: number | undefined, name: string) {
      if (index === undefined) {
        this.add_sheet(name)
        return sheets.length - 1
      }
      this.rename_sheet(index, name)
      return index
    }

    remove_sheet(index: number) {
      sheets.splice(index, 1)
      return true
    }

    sheet_count() {
      return sheets.length
    }

    sheet_name(index: number) {
      return sheets[index]!.name
    }

    sheet_key(index: number) {
      return sheets[index]!.key
    }

    history_state() {
      return state
    }

    history_apply = apply
    read_sparse_range() {
      return []
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }

    snapshot_viewport_sizes() {
      return { rowHeights: [], colWidths: [] }
    }

    capture_clipboard() {
      return { text: 'value' }
    }

    paste_clipboard = paste
  }
  installRustWorkbookRuntime({
    default: async () => {},
    WasmWorkbook: Native,
  } as unknown as RustWasmModule)
  const call = async (command: string, payload: unknown) => {
    await message({ data: { id: posted.mock.calls.length + 1, command, payload } })
    return posted.mock.lastCall![0]
  }
  const initialized = await call('workbook.initialize', {
    sheets: [
      { id: 'orders', name: 'Orders', rowCount: 1001, colCount: 16 },
      { id: 'summary', name: 'Summary', rowCount: 12, colCount: 2 },
    ],
  })
  expect(initialized.ok).toBe(true)
  return {
    call,
    apply,
    paste,
    replace: (next: typeof sheets) => {
      sheets = next
    },
    record: (key: string, index: number, label: string) => {
      state = {
        undoCount: 1,
        redoCount: 0,
        notice: null,
        entries: [
          {
            label,
            sheetIndex: index,
            sheetKey: key,
            sheetChange: true,
            affectedSheetKeys: ['1', '2', key],
            range,
          },
        ],
      }
    },
  }
}

test('restoring a deleted worksheet returns its original ID and small canvas without replaying cells', async () => {
  const r = await setup()
  r.record('2', 1, 'Delete worksheet')
  expect(
    (await r.call('workbook.changeSheets', { operation: 'delete', sheetId: 'summary' })).ok,
  ).toBe(true)
  r.apply.mockImplementation(() => {
    r.replace([
      { key: '1', name: 'Orders' },
      { key: '2', name: 'Summary' },
    ])
    return true
  })
  const result = await r.call('history.apply', {
    direction: 'undo',
    projection: { ...projection, sheetId: 'orders' },
  })
  expect(result.ok).toBe(true)
  expect(r.apply).toHaveBeenCalledTimes(1)
  expect(r.apply).toHaveBeenCalledWith('undo')
  expect(result.result.sheets).toEqual([
    { id: 'orders', key: '1', name: 'Orders', index: 0, rowCount: 1001, colCount: 16 },
    { id: 'summary', key: '2', name: 'Summary', index: 1, rowCount: 12, colCount: 2 },
  ])
  expect(result.result.projection).toMatchObject({ sheetId: 'orders', requestId: 8, revision: 2 })
  expect(result.result.range).toEqual({ rowStart: 0, rowEnd: 11, colStart: 0, colEnd: 1 })
})

test('undoing add chooses the actual neighbor and clamps the fallback projection to its bounds', async () => {
  const r = await setup()
  const added = await r.call('workbook.editSheet', { name: 'Third', rowCount: 1001, colCount: 16 })
  r.record('3', 2, 'Add worksheet')
  r.apply.mockImplementation(() => {
    r.replace([
      { key: '1', name: 'Orders' },
      { key: '2', name: 'Summary' },
    ])
    return true
  })
  const result = await r.call('history.apply', {
    direction: 'undo',
    projection: {
      ...projection,
      sheetId: added.result.sheet.id,
      window: { rowStart: 990, rowEnd: 1000, colStart: 10, colEnd: 15 },
    },
  })
  expect(result.ok).toBe(true)
  expect(result.result.sheetId).toBe(added.result.sheet.id)
  expect(result.result.projection).toMatchObject({
    sheetId: 'summary',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 1 },
  })
})

test('native reorder is resolved by keys, not stale indices or names', async () => {
  const r = await setup()
  r.record('1', 0, 'Move worksheet')
  r.apply.mockImplementation(() => {
    r.replace([
      { key: '2', name: 'Summary' },
      { key: '1', name: 'Orders' },
    ])
    return true
  })
  const result = await r.call('history.apply', { direction: 'undo', projection })
  expect(result.ok).toBe(true)
  expect(result.result.sheets.map((sheet: { id: string }) => sheet.id)).toEqual([
    'summary',
    'orders',
  ])
  expect(result.result.projection.sheetId).toBe('summary')
})

test('a structural history response invalidates the old clipboard token before native paste', async () => {
  const r = await setup()
  const copied = await r.call('clipboard.capture', { sheetId: 'orders', range, cut: false })
  r.record('1', 0, 'Rename worksheet')
  expect((await r.call('history.apply', { direction: 'undo', projection })).ok).toBe(true)
  const result = await r.call('clipboard.paste', {
    projection,
    request: {
      sheetId: 'summary',
      row: 0,
      col: 0,
      text: 'value',
      token: copied.result.token,
    },
  })
  expect(result).toMatchObject({ ok: false, error: { message: 'CLIPBOARD_SHEET_HISTORY_CHANGED' } })
  expect(r.paste).not.toHaveBeenCalled()
})

test('invalid visible sheet is rejected before native history advances', async () => {
  const r = await setup()
  r.record('1', 0, 'Rename worksheet')
  expect(
    (
      await r.call('history.apply', {
        direction: 'undo',
        projection: { ...projection, sheetId: 'missing' },
      })
    ).ok,
  ).toBe(false)
  expect(r.apply).not.toHaveBeenCalled()
})
