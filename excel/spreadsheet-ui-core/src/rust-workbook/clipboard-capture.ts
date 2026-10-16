import type { RustClipboardCapture, RustClipboardCaptureRequest } from './clipboard-commands'
import type { WasmWorkbook } from './wasm-types'

/** 普通剪贴板先暂存到 Rust；格式刷独立槽不依赖浏览器写入确认。 */
export function captureClipboard(
  workbook: WasmWorkbook,
  sheet: number,
  input: RustClipboardCaptureRequest,
): RustClipboardCapture {
  const { range } = input
  const coordinates = [sheet, range.rowStart, range.colStart, range.rowEnd, range.colEnd] as const
  let captured: Omit<RustClipboardCapture, 'token'>
  if (input.painter) {
    if (input.cut) throw new Error('CLIPBOARD_INVALID_POLICY')
    if (!workbook.capture_format_painter) throw new Error('Rust clipboard export is unavailable')
    captured = workbook.capture_format_painter(...coordinates)
  } else {
    if (!workbook.prepare_clipboard || !workbook.finish_clipboard_capture)
      throw new Error('Rust clipboard confirmation is unavailable')
    captured = workbook.prepare_clipboard(...coordinates, input.cut)
  }
  return { ...captured, token: crypto.randomUUID() }
}

/** 迟到的剪切不能清错源位置；工作簿已变时释放暂存槽并提示重新复制。 */
export function finishClipboardCapture(
  workbook: WasmWorkbook, commit: boolean, unchanged: boolean,
): void {
  if (!workbook.finish_clipboard_capture) throw new Error('Rust clipboard confirmation is unavailable')
  workbook.finish_clipboard_capture(commit && unchanged)
  if (commit && !unchanged) throw new Error('Workbook changed. Copy or cut again.')
}
