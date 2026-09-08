import { afterEach, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 }
const projection = {
  kind: 'visible-window',
  sheetId: 's',
  requestId: 1,
  reason: 'toolbar',
  window: range,
}
async function setup() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    postMessage: post,
    addEventListener: (_: string, callback: typeof receive) => {
      receive = callback
    },
  })
  const edit = vi.fn(() => true)
  const paste = vi.fn(() => [0, 0, 0, 0])
  const apply = vi.fn(() => true)
  class Native {
    rename_sheet() {}
    sheet_count() {
      return 1
    }

    sheet_name() {
      return 'Sheet'
    }

    sheet_key() {
      return '1'
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

    sheet_visibility() {
      return { manualRows: [], manualColumns: [], filterRows: [] }
    }

    capture_clipboard() {
      return { text: 'copy' }
    }

    history_state() {
      return {
        undoCount: 1,
        redoCount: 0,
        notice: null,
        entries: [
          {
            sheetIndex: 0,
            sheetKey: '1',
            label: 'Insert rows',
            range,
            structuralEdit: { action: 'insert-rows', at: 1, count: 1 },
          },
        ],
      }
    }

    edit_structure = edit
    paste_clipboard = paste
    history_apply = apply
  }
  installRustWorkbookRuntime({
    default: async () => {},
    WasmWorkbook: Native,
  } as unknown as RustWasmModule)
  const call = async (command: string, payload: unknown) => {
    const id = post.mock.calls.length + 1
    await receive({ data: { id, command, payload } })
    expect(post).toHaveBeenCalledTimes(id)
    return post.mock.lastCall![0]
  }
  expect(
    (
      await call('workbook.initialize', {
        sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8 }],
      })
    ).ok,
  ).toBe(true)
  const structure = () =>
    call('sheet.editStructure', {
      sheetId: 's',
      projection,
      edit: { action: 'insert-rows', at: 1, count: 1 },
    })
  return { call, structure, edit, apply, paste }
}

test('wire structure command returns one correlated projection and advances revision once', async () => {
  const r = await setup()
  const result = await r.structure()
  expect(result).toMatchObject({
    id: 2,
    ok: true,
    result: {
      sheet: { id: 's', rowCount: 101, colCount: 8 },
      projection: { sheetId: 's', revision: 1, requestId: 1 },
    },
  })
  expect(r.edit).toHaveBeenCalledTimes(1)
  expect(r.edit).toHaveBeenCalledWith(0, 'insert-rows', 1, 1)
  const undo = await r.call('history.apply', { direction: 'undo', projection })
  expect(undo).toMatchObject({
    ok: true,
    result: { sheets: [{ rowCount: 100 }], projection: { revision: 2 } },
  })
  expect(r.apply).toHaveBeenCalledTimes(1)
})

test.each(['edit', 'undo'] as const)(
  '%s invalidates the clipboard token before native paste',
  async (operation) => {
    const r = await setup()
    await r.structure()
    const copied = await r.call('clipboard.capture', { sheetId: 's', range, cut: true })
    if (operation === 'edit') await r.structure()
    else await r.call('history.apply', { direction: 'undo', projection })
    const result = await r.call('clipboard.paste', {
      projection,
      request: {
        sheetId: 's',
        row: 0,
        col: 0,
        text: 'copy',
        token: copied.result.token,
      },
    })
    expect(result).toMatchObject({
      ok: false,
      error: { message: 'CLIPBOARD_SHEET_HISTORY_CHANGED' },
    })
    expect(r.paste).not.toHaveBeenCalled()
  },
)

test('failed native edit does not advance revision', async () => {
  const r = await setup()
  r.edit.mockImplementationOnce(() => {
    throw new Error('Overflow')
  })
  expect(await r.structure()).toMatchObject({ ok: false, error: { message: 'Overflow' } })
  expect(await r.call('projection.readVisible', { request: projection })).toMatchObject({
    ok: true,
    result: { revision: 0 },
  })
  expect(await r.structure()).toMatchObject({
    ok: true,
    result: {
      sheet: { rowCount: 101 },
      projection: { revision: 1 },
    },
  })
})
