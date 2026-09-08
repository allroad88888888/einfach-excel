import { atom } from '@einfach/core'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { editingSessionAtom } from '../editing/session-atoms'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { sheetProtectionAtom } from '../protection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import type {
  RustClipboardCapture,
  RustClipboardPasteMode,
  RustClipboardExport,
  RustClipboardExportFormat,
  RustClipboardPasteRequest,
} from '../rust-workbook/clipboard-commands'
import { selectionSnapshotAtom } from '../selection'
import { validateProjectionResult } from '../projection/contracts'
import { applyProjectionSizes } from '../projection/projection-sizes'

export interface SystemClipboardData {
  readonly text: string
  readonly token?: string
}

export type SystemClipboardOperation =
  | {
      readonly operation: 'copy-as'
      readonly format: RustClipboardExportFormat
      readonly write: (data: Promise<RustClipboardExport>) => Promise<void>
    }
  | {
      readonly operation: 'copy' | 'cut'
      // Promise 交给浏览器立即创建 ClipboardItem，保留用户手势权限。
      readonly write: (data: Promise<RustClipboardCapture>) => Promise<void>
    }
  | {
      readonly operation: 'paste'
      readonly mode?: RustClipboardPasteMode
      readonly arithmetic?: RustClipboardPasteRequest['arithmetic']
      readonly transpose?: boolean
      readonly skipBlanks?: boolean
      readonly read: () => Promise<SystemClipboardData>
    }

interface SystemClipboardFeedback {
  readonly busy: boolean
  readonly error: boolean
  readonly message: string
}
const feedbackAtom = atom<SystemClipboardFeedback>({ busy: false, error: false, message: '' })
export const systemClipboardFeedbackAtom = atom((get) => get(feedbackAtom))

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CLIPBOARD_EMPTY: 'The copied worksheet was deleted. Copy cells again before pasting.',
  CLIPBOARD_SELECTION_SIZE:
    'The selected range must fit whole copies of the clipboard. Nothing was pasted.',
  CLIPBOARD_CUT_SPECIAL: 'Paste special requires Copy, not Cut. The cut cells are unchanged.',
  CLIPBOARD_NO_FORMATS:
    'This clipboard has no workbook formatting. Copy cells in this workbook first.',
  CLIPBOARD_OUTSIDE_SHEET: 'Paste would extend beyond the sheet. Choose another cell.',
  CLIPBOARD_TOO_LARGE: 'This clipboard range is too large. Select a smaller range.',
  CLIPBOARD_CUT_SOURCE_CHANGED: 'The cut cells changed. Cut the range again before pasting.',
  CLIPBOARD_SPILL_SOURCE: 'An array result cannot be cut independently.',
  CLIPBOARD_SPILL_TARGET: 'Paste cannot overwrite an array result.',
  CLIPBOARD_PARTIAL_REFERENCE_MOVE:
    'A formula refers to a larger range. Moving part of that range is not supported yet.',
  CLIPBOARD_CROSS_SHEET_CUT: 'Cut between sheets is not supported yet.',
  CLIPBOARD_LOCKED: 'The source or destination includes locked cells.',
  CLIPBOARD_CUT_CONSUMED: 'These cells have already been moved. Copy or cut again to paste.',
  CLIPBOARD_SHEET_HISTORY_CHANGED:
    'Worksheet history changed the clipboard source. Copy or cut again to paste.',
  CLIPBOARD_INVALID_FORMULA: 'The clipboard contains an invalid formula. Nothing was pasted.',
  CLIPBOARD_INVALID_TSV: 'The clipboard text has unmatched quotes. Nothing was pasted.',
  CLIPBOARD_ARITHMETIC_FORMATS: 'Paste arithmetic needs cell contents, not formatting only.',
  CLIPBOARD_UNSUPPORTED_ARITHMETIC: 'This cell type cannot be used in paste arithmetic.',
  CLIPBOARD_COLUMN_WIDTH_OPTIONS:
    'Column widths cannot be combined with arithmetic, transpose or skip blanks.',
  CLIPBOARD_COLUMN_WIDTH_LOCKED: 'Unprotect the worksheet before pasting column widths.',
}

/** 一个入口处理系统剪贴板手势；工作簿数据只有 Rust 快照一份。 */
export const runSystemClipboardAtom = atom(
  null,
  async (get, set, input: SystemClipboardOperation): Promise<boolean> => {
    if (
      get(feedbackAtom).busy ||
      get(editingSessionAtom).source !== null ||
      get(selectionStructureFeedbackAtom).busy
    )
      return false
    const sheet = get(activeWorkbookSheetAtom)
    const connection = get(rustWorkbookConnectionAtom)
    const selection = get(selectionSnapshotAtom)
    if (!sheet || !connection || selection.selection.sheetId !== sheet.id) return false
    set(feedbackAtom, { busy: true, error: false, message: `${input.operation}…` })
    try {
      if (input.operation === 'copy-as') {
        if (
          set(resolveContentMutationAtom, {
            kind: 'clear-range',
            sheetId: sheet.id,
            range: selection.range,
            protectionGate: false,
          }).status === 'blocked'
        )
          throw new Error('CLIPBOARD_INVALID_RANGE')
        const exported = connection.request('clipboard.export', {
          sheetId: sheet.id,
          range: selection.range,
          format: input.format,
        })
        // 与普通复制一样同步启动浏览器写入；不刷新屏幕投影，也不改变剪切快照。
        const written = new Promise<void>((resolve) => resolve(input.write(exported)))
        const [data] = await Promise.all([exported, written])
        set(feedbackAtom, {
          busy: false,
          error: false,
          message: `Copied ${data.rows} × ${data.cols} cells as ${input.format}.`,
        })
        return true
      }
      if (input.operation !== 'paste') {
        if (
          set(resolveContentMutationAtom, {
            kind: 'clear-range',
            sheetId: sheet.id,
            range: selection.range,
            protectionGate: input.operation === 'cut',
          }).status === 'blocked'
        )
          throw new Error('CLIPBOARD_LOCKED')
        const captured = connection.request('clipboard.capture', {
          sheetId: sheet.id,
          range: selection.range,
          cut: input.operation === 'cut',
        })
        // 浏览器写入与 Rust 响应一起结算，即使权限同步失败也接住 RPC 拒绝。
        const written = new Promise<void>((resolve) => resolve(input.write(captured)))
        const [data] = await Promise.all([captured, written])
        set(feedbackAtom, {
          busy: false,
          error: false,
          message:
            input.operation === 'cut'
              ? `${data.rows} × ${data.cols} cells ready to move. Paste to finish.`
              : `Copied ${data.rows} × ${data.cols} cells.`,
        })
        return true
      }

      const data = await input.read()
      if (
        get(selectionSnapshotAtom) !== selection ||
        get(rustWorkbookConnectionAtom) !== connection ||
        get(editingSessionAtom).source !== null
      )
        throw new Error('Selection changed. Paste again.')
      const witness = get(projectionSnapshotAtom)
      const visible = witness.request
      if (visible?.kind !== 'visible-window' || visible.sheetId !== sheet.id) {
        throw new Error('Wait for the selected sheet to load.')
      }
      const row = selection.range.rowStart
      const col = selection.range.colStart
      if (
        set(resolveContentMutationAtom, {
          kind: input.mode === 'formats' ? 'set-format-range' : 'paste-range',
          sheetId: sheet.id,
          cell: { row, col },
          // 首格也可能被跳过；实际写入哪些格只有 Rust 快照知道，保护交给它完整检查。
          protectionGate: input.skipBlanks !== true,
        }).status === 'blocked'
      )
        throw new Error('CLIPBOARD_LOCKED')
      const protection = get(sheetProtectionAtom)[sheet.id]
      const requestId = set(issueProjectionRequestIdAtom)
      if (requestId === null) throw new Error('The workbook is unavailable.')
      const projection = createVisibleProjectionRequest({
        sheetId: sheet.id,
        window: visible.window,
        requestId,
        reason: 'toolbar',
      })
      const result = await connection.request('clipboard.paste', {
        request: {
          sheetId: sheet.id,
          requestId,
          row,
          col,
          ...data,
          mode: input.mode ?? 'all',
          ...(input.arithmetic ? { arithmetic: input.arithmetic } : {}),
          transpose: input.transpose ?? false,
          skipBlanks: input.skipBlanks ?? false,
          selection: selection.range,
          rowCount: sheet.rowCount,
          colCount: sheet.colCount,
          // Rust 校验整个实际粘贴范围，不只检查左上角。
          unlockedRanges: protection?.mode === 'protected' ? protection.unlockedRanges : undefined,
        },
        projection,
      })
      const ack = result.acknowledgement
      if (
        ack.sheetId !== sheet.id ||
        ack.requestId !== requestId ||
        ack.revision !== result.projection.revision
      )
        throw new Error('Invalid paste acknowledgement.')
      if (input.mode === 'column-widths') {
        if (get(rustWorkbookConnectionAtom) !== connection)
          throw new Error('The workbook changed. Paste again.')
        const range = ack.affectedRange
        if (
          !range ||
          !result.colWidths ||
          !validateProjectionResult(result.projection, { request: projection }).ok ||
          !Object.values(range).every(Number.isSafeInteger) ||
          range.rowStart !== row ||
          range.rowEnd < row ||
          range.rowEnd >= sheet.rowCount ||
          range.colStart !== col ||
          range.colEnd < col ||
          range.colEnd >= sheet.colCount
        )
          throw new Error('Invalid column width result.')
        // 合并整个粘贴目标的列宽，屏幕外列也参与滚动定位；不再发第二次刷新。
        applyProjectionSizes(get, set, {
          ...result.projection,
          window: range,
          rowHeights: undefined,
          colWidths: result.colWidths,
        })
      }
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      set(feedbackAtom, { busy: false, error: false, message: 'Pasted cells.' })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set(feedbackAtom, { busy: false, error: true, message: ERROR_MESSAGES[message] ?? message })
      return false
    }
  },
)
runSystemClipboardAtom.debugLabel = 'spreadsheet.clipboard.runSystemClipboard'
systemClipboardFeedbackAtom.debugLabel = 'spreadsheet.clipboard.systemFeedback'
