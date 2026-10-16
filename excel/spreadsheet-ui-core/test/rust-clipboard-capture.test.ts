import { describe, expect, test, vi } from 'vitest'
import { captureClipboard, finishClipboardCapture } from '../src/rust-workbook/clipboard-capture'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

const input = { sheetId: 'sheet', range: { rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 3 }, cut: false }
function setup() {
  const result = { text: 'frozen', rows: 3, cols: 3, cut: false }
  const workbook = {
    prepare_clipboard: vi.fn(() => result),
    finish_clipboard_capture: vi.fn(),
    capture_format_painter: vi.fn(() => result),
    capture_clipboard: vi.fn(() => result),
  }
  return { workbook, wasm: workbook as unknown as WasmWorkbook }
}

describe('native clipboard capture boundary', () => {
  test.each([false, true])('copy/cut prepares exact coordinates without promotion (cut=%s)', (cut) => {
    const { workbook, wasm } = setup()
    const result = captureClipboard(wasm, 7, { ...input, cut })
    expect(workbook.prepare_clipboard.mock.calls).toEqual([[7, 2, 1, 4, 3, cut]])
    expect(workbook.finish_clipboard_capture).not.toHaveBeenCalled()
    expect(workbook.capture_clipboard).not.toHaveBeenCalled()
    expect(workbook.capture_format_painter).not.toHaveBeenCalled()
    expect(result).toMatchObject({ text: 'frozen', rows: 3, cols: 3 })
    expect(result.token).not.toBe(captureClipboard(wasm, 7, input).token)
  })

  test('painter uses its independent slot without requiring browser confirmation exports', () => {
    const { workbook, wasm } = setup()
    delete wasm.prepare_clipboard
    delete wasm.finish_clipboard_capture
    captureClipboard(wasm, 7, { ...input, painter: true })
    expect(workbook.capture_format_painter.mock.calls).toEqual([[7, 2, 1, 4, 3]])
  })

  test('cut cannot be smuggled into format painting', () => {
    const { workbook, wasm } = setup()
    expect(() => captureClipboard(wasm, 7, { ...input, painter: true, cut: true }))
      .toThrow('CLIPBOARD_INVALID_POLICY')
    expect(workbook.capture_format_painter).not.toHaveBeenCalled()
    expect(workbook.prepare_clipboard).not.toHaveBeenCalled()
  })

  test.each(['prepare_clipboard', 'finish_clipboard_capture'] as const)('missing %s rejects before preparing or using the legacy immediate slot', (method) => {
    const { workbook, wasm } = setup()
    const prepare = workbook.prepare_clipboard
    delete wasm[method]
    expect(() => captureClipboard(wasm, 0, input)).toThrow('confirmation is unavailable')
    expect(prepare).not.toHaveBeenCalled()
    expect(workbook.capture_clipboard).not.toHaveBeenCalled()
  })

  test('missing painter export does not fall back to ordinary clipboard', () => {
    const { workbook, wasm } = setup()
    delete wasm.capture_format_painter
    expect(() => captureClipboard(wasm, 0, { ...input, painter: true })).toThrow('export is unavailable')
    expect(workbook.prepare_clipboard).not.toHaveBeenCalled()
  })

  test('native capture failures propagate without confirmation', () => {
    const { workbook, wasm } = setup()
    const error = new Error('CLIPBOARD_PARTIAL_MERGE')
    workbook.prepare_clipboard.mockImplementationOnce(() => { throw error })
    expect(() => captureClipboard(wasm, 0, input)).toThrow(error)
    expect(workbook.finish_clipboard_capture).not.toHaveBeenCalled()
  })

  test.each([[false, false], [false, true], [true, true]])('finish commit=%s unchanged=%s calls Rust once', (commit, unchanged) => {
    const { workbook, wasm } = setup()
    finishClipboardCapture(wasm, commit, unchanged)
    expect(workbook.finish_clipboard_capture.mock.calls).toEqual([[commit && unchanged]])
    expect(workbook.prepare_clipboard).not.toHaveBeenCalled()
  })

  test('stale success discards first and then asks for another copy', () => {
    const { workbook, wasm } = setup()
    expect(() => finishClipboardCapture(wasm, true, false)).toThrow('Copy or cut again')
    expect(workbook.finish_clipboard_capture.mock.calls).toEqual([[false]])
  })

  test('native confirmation errors are not reported as success', () => {
    const { workbook, wasm } = setup()
    workbook.finish_clipboard_capture.mockImplementationOnce(() => { throw new Error('disconnected') })
    expect(() => finishClipboardCapture(wasm, true, true)).toThrow('disconnected')
    delete wasm.finish_clipboard_capture
    expect(() => finishClipboardCapture(wasm, false, true)).toThrow('confirmation is unavailable')
  })
})
