import { exportClipboard } from '../clipboard-export'
import { captureClipboard, finishClipboardCapture } from '../clipboard-capture'
import type { WorkbookHandlers } from './context'

/** 剪贴板快照的导出、捕获与确认；粘贴写入在 cell-writes。 */
export const clipboardHandlers: WorkbookHandlers = {
  'clipboard.export': (context, current, input) =>
    exportClipboard(current, context.sheetIndex(input.sheetId), input),
  'clipboard.capture': (context, current, input) => {
    const captured = captureClipboard(current, context.sheetIndex(input.sheetId), input)
    if (input.painter) context.painterToken = captured.token
    else context.pendingClipboard =
      { token: captured.token, cut: input.cut, revision: context.revision }
    return captured
  },
  'clipboard.finishCapture': (context, current, input) => {
    if (input.token !== context.pendingClipboard?.token) return
    const pending = context.pendingClipboard
    context.pendingClipboard = undefined
    finishClipboardCapture(current, input.commit, pending.revision === context.revision)
    if (input.commit) context.clipboard = { token: pending.token, cut: pending.cut }
    return
  },
}
