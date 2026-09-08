import { afterEach, describe, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'

afterEach(() => vi.unstubAllGlobals())
const range = { rowStart: 1, rowEnd: 2, colStart: 0, colEnd: 1 }
const projection = { kind: 'visible-window', sheetId: 'orders', requestId: 2, window: range }
async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => {
      receive = fn
    },
    postMessage: post,
  })
  const begin = vi.fn(),
    finish = vi.fn(),
    clear = vi.fn(),
    apply = vi.fn(() => true)
  const input = vi.fn(),
    format = vi.fn(),
    clearRange = vi.fn(),
    paste = vi.fn(() => [1, 0, 2, 1])
  const edit = vi.fn(() => 0)
  let undoCount = 1
  class TestWorkbook {
    rename_sheet() {
      return true
    }

    sheet_name(index: number) {
      return index === 0 ? 'Orders' : 'Summary'
    }

    add_sheet() {
      return 1
    }

    edit_sheet = edit
    history_begin = begin
    history_finish = finish
    history_clear = clear
    history_apply = apply
    history_state() {
      return {
        undoCount,
        redoCount: 1 - undoCount,
        entries: [{ label: 'Edit cell', sheetIndex: 0, range }],
        notice: null,
      }
    }

    set_cell_input = input
    patch_format_range = format
    clear_range = clearRange
    paste_clipboard = paste
    capture_clipboard() {
      return { text: 'copy' }
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
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', {
    sheets: [
      { id: 'orders', name: 'Orders' },
      { id: 'summary', name: 'Summary' },
    ],
  })
  return {
    call,
    begin,
    finish,
    clear,
    apply,
    input,
    format,
    clearRange,
    paste,
    edit,
    setUndoCount: (value: number) => {
      undoCount = value
    },
  }
}

describe('Rust history transport', () => {
  test('cell input is one native group and keeps its raw input unchanged', async () => {
    const r = await runtime()
    const result = await r.call('cell.setInput', {
      projection,
      request: { sheetId: 'orders', requestId: 1, row: 1, col: 0, input: "'00123" },
    })
    expect(result.ok).toBe(true)
    expect(r.begin.mock.calls).toEqual([[0, 1, 0, 1, 0, 'Edit cell', true]])
    expect(r.input.mock.calls).toEqual([[0, 'A2', "'00123"]])
    expect(r.finish.mock.calls).toEqual([[true]])
    expect(result.result.projection.history.undoCount).toBe(1)
  })
  test('clear-all groups format and content; scope captures complete intersecting styles', async () => {
    const r = await runtime()
    const result = await r.call('range.clear', {
      projection,
      request: { sheetId: 'orders', requestId: 1, range, scope: 'row', mode: 'all' },
    })
    expect(result.ok).toBe(true)
    expect(r.begin.mock.calls).toEqual([[0, 1, 0, 2, 16383, 'Clear all', true]])
    expect(r.format).toHaveBeenCalledTimes(1)
    expect(r.clearRange.mock.calls).toEqual([[0, 1, 0, 2, 1]])
    expect(r.finish.mock.calls).toEqual([[true]])
    expect(r.format.mock.invocationCallOrder[0]).toBeLessThan(
      r.clearRange.mock.invocationCallOrder[0]!,
    )
  })
  test('native rejection aborts the group and leaves the transport revision unchanged', async () => {
    const r = await runtime()
    r.input.mockImplementationOnce(() => {
      throw new Error('Invalid input')
    })
    expect(
      (
        await r.call('cell.setInput', {
          projection,
          request: { sheetId: 'orders', requestId: 1, row: 1, col: 0, input: '=SUM(' },
        })
      ).ok,
    ).toBe(false)
    expect(r.finish.mock.calls).toEqual([[false]])
    expect((await r.call('projection.readVisible', { request: projection })).result.revision).toBe(
      0,
    )
  })
  test('undo uses Rust once and projects the currently viewed sheet, not the source sheet', async () => {
    const r = await runtime()
    r.apply.mockImplementationOnce(() => {
      r.setUndoCount(0)
      return true
    })
    const result = await r.call('history.apply', {
      direction: 'undo',
      projection: { ...projection, sheetId: 'summary' },
    })
    expect(r.apply.mock.calls).toEqual([['undo']])
    expect(result).toMatchObject({
      ok: true,
      result: {
        sheetId: 'orders',
        range,
        projection: { sheetId: 'summary', revision: 1, history: { undoCount: 0, redoCount: 1 } },
      },
    })
    expect((await r.call('history.apply', { direction: 'undo', projection })).ok).toBe(false)
    expect(r.apply).toHaveBeenCalledTimes(1)
  })
  test('bad projection is rejected before undo changes native state', async () => {
    const r = await runtime()
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
  test('copy and paste never clear native history; paste returns the native history directory', async () => {
    const r = await runtime()
    await r.call('clipboard.capture', { sheetId: 'orders', range, cut: false })
    expect(r.clear).not.toHaveBeenCalled()
    r.paste.mockImplementationOnce(() => {
      throw new Error('Paste rejected')
    })
    const payload = { projection, request: { sheetId: 'orders', row: 1, col: 0, text: 'a' } }
    expect((await r.call('clipboard.paste', payload)).ok).toBe(false)
    expect(r.clear).not.toHaveBeenCalled()
    const result = await r.call('clipboard.paste', payload)
    expect(result.ok).toBe(true)
    expect(result.result.projection.history.undoCount).toBe(1)
    expect(r.clear).not.toHaveBeenCalled()
    expect(r.begin).not.toHaveBeenCalled()
    expect(r.finish).not.toHaveBeenCalled()
  })
  test('failed worksheet changes do not clear history', async () => {
    const r = await runtime()
    r.edit.mockImplementationOnce(() => {
      throw new Error('Duplicate name')
    })
    const payload = { sheetId: 'orders', name: 'Summary', projection }
    expect((await r.call('workbook.editSheet', payload)).ok).toBe(false)
    expect(r.clear).not.toHaveBeenCalled()
    expect((await r.call('workbook.editSheet', { ...payload, name: 'Renamed' })).ok).toBe(true)
    expect(r.clear.mock.lastCall?.[0]).toContain('worksheet change')
  })
})
