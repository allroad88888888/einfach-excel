import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { selectionSnapshotAtom, type SelectionSnapshot } from '../selection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type {
  RustClipboardPasteMode,
  RustClipboardPasteRequest,
} from '../rust-workbook/clipboard-commands'
import {
  runSystemClipboardAtom,
  systemClipboardFeedbackAtom,
  type SystemClipboardData,
} from './system-clipboard-command'

type Arithmetic = NonNullable<RustClipboardPasteRequest['arithmetic']>
interface PasteSpecialDraft {
  readonly target: SelectionSnapshot | null
  readonly connection: RustWorkbookConnection | null
  readonly mode: RustClipboardPasteMode
  readonly arithmetic: Arithmetic
  readonly transpose: boolean
  readonly skipBlanks: boolean
  readonly attempted: boolean
}
const CLOSED: PasteSpecialDraft = {
  target: null,
  connection: null,
  mode: 'all',
  arithmetic: 'none',
  transpose: false,
  skipBlanks: false,
  attempted: false,
}
const draftAtom = atom<PasteSpecialDraft>(CLOSED)

/** 投影/测量可能重建同一选区对象；只比较实际粘贴目标，不把引用变化当作用户换区。 */
function sameTarget(target: SelectionSnapshot, current: SelectionSnapshot): boolean {
  return (
    target.selection.sheetId === current.selection.sheetId &&
    target.range.rowStart === current.range.rowStart &&
    target.range.rowEnd === current.range.rowEnd &&
    target.range.colStart === current.range.colStart &&
    target.range.colEnd === current.range.colEnd
  )
}

/** 面板只保存选项；忙碌/失败读取原剪贴板状态，不另建一套提交生命周期。 */
export const pasteSpecialPanelAtom = atom((get) => {
  const draft = get(draftAtom)
  const feedback = get(systemClipboardFeedbackAtom)
  const changed =
    !!draft.target &&
    (!sameTarget(draft.target, get(selectionSnapshotAtom)) ||
      draft.connection !== get(rustWorkbookConnectionAtom))
  return {
    ...draft,
    busy: feedback.busy,
    error: changed
      ? 'Selection changed. Close and reopen Paste special.'
      : draft.attempted && feedback.error
        ? feedback.message
        : null,
  }
})

type PanelAction =
  | 'open'
  | 'close'
  | { readonly field: 'mode'; readonly value: RustClipboardPasteMode }
  | { readonly field: 'arithmetic'; readonly value: Arithmetic }
  | { readonly field: 'transpose' | 'skipBlanks'; readonly value: boolean }
  | { readonly action: 'apply'; readonly read: () => Promise<SystemClipboardData> }

/** 打开时固定目标；提交复用一个原 command，所有组合规则与数据写入仍由 Rust 预检。 */
export const runPasteSpecialPanelAtom = atom(
  null,
  (get, set, action: PanelAction): boolean | Promise<boolean> => {
    const state = get(draftAtom)
    if (get(systemClipboardFeedbackAtom).busy) return false
    if (action === 'close') {
      set(draftAtom, CLOSED)
      return true
    }
    if (action === 'open') {
      const target = get(selectionSnapshotAtom)
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection || !target.selection.sheetId || get(editingSessionAtom).source !== null)
        return false
      set(draftAtom, { ...CLOSED, target, connection })
      return true
    }
    if (
      !state.target ||
      !sameTarget(state.target, get(selectionSnapshotAtom)) ||
      state.connection !== get(rustWorkbookConnectionAtom)
    )
      return false
    if ('field' in action) {
      const next = { ...state, [action.field]: action.value, attempted: false }
      if (next.mode === 'column-widths') {
        next.arithmetic = 'none'
        next.transpose = false
        next.skipBlanks = false
      } else if (next.mode === 'formats') next.arithmetic = 'none'
      set(draftAtom, next)
      return true
    }
    const pending = set(runSystemClipboardAtom, {
      operation: 'paste',
      mode: state.mode,
      arithmetic: state.arithmetic,
      transpose: state.transpose,
      skipBlanks: state.skipBlanks,
      read: action.read,
    })
    return (async () => {
      // 浏览器读取已在用户手势内启动；异步续体发布面板状态，避免等权限结束才通知视图。
      await Promise.resolve()
      set(draftAtom, { ...state, attempted: true })
      const ok = await pending
      if (ok) set(draftAtom, CLOSED)
      return ok
    })()
  },
)
pasteSpecialPanelAtom.debugLabel = 'spreadsheet.clipboard.pasteSpecialPanel'
runPasteSpecialPanelAtom.debugLabel = 'spreadsheet.clipboard.runPasteSpecialPanel'
