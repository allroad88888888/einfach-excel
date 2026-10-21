import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import {
  runSystemClipboardAtom, systemClipboardFeedbackAtom, clipboardErrorMessage,
} from '../clipboard/system-clipboard-command'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom, selectionAuthorityWitnessAtom } from '../selection'
import { workspaceActiveSheetAuthorityWitnessAtom } from '../workspace'
import { endPointerSelectionAtom } from '../selection/pointer-selection-commands'
import { pointerSessionAtom } from '../pointer'
import { formatPainterAtom, IDLE, painterStateAtom } from './state'
export { formatPainterAtom } from './state'

export const runFormatPainterAtom = atom(null, async (get, set,
  action: 'arm' | 'sticky' | 'apply' | 'end-selection' | 'exit',
): Promise<boolean> => {
  if (action === 'end-selection') {
    const pointer = get(pointerSessionAtom)
    set(endPointerSelectionAtom)
    if (pointer.status !== 'active' || pointer.interaction?.kind !== 'drag-selection') return false
    action = 'apply'
  }
  const state = get(formatPainterAtom)
  if (action === 'exit') {
    set(painterStateAtom, IDLE)
    return true
  }
  // 双击在第一次单击抓取尚未结束时也能切为连续模式，不重复抓取。
  if (action === 'sticky' && state.mode === 'armed') {
    set(painterStateAtom, { ...state, mode: 'sticky' })
    return true
  }
  if (state.busy || get(systemClipboardFeedbackAtom).busy || get(editingSessionAtom).source)
    return false
  const connection = get(rustWorkbookConnectionAtom)
  const sheet = get(activeWorkbookSheetAtom)
  const selection = get(selectionSnapshotAtom)
  if (!connection || !sheet || selection.selection.sheetId !== sheet.id) return false
  if (action !== 'apply') {
    const witness = get(selectionAuthorityWitnessAtom)
    const session = { connection, workspace: get(workspaceActiveSheetAuthorityWitnessAtom) }
    set(painterStateAtom, { mode: action === 'sticky' ? 'sticky' : 'armed', busy: true,
      message: 'Capturing formatting…', error: false, session })
    try {
      const captured = await connection.request('clipboard.capture', {
        sheetId: sheet.id, range: selection.range, cut: false, painter: true,
      })
      if (get(formatPainterAtom).session !== session) return false
      if (get(selectionAuthorityWitnessAtom) !== witness) {
        set(painterStateAtom, { ...IDLE, message: 'Selection changed. Start Format painter again.', error: true })
        return false
      }
      set(painterStateAtom, { ...get(formatPainterAtom), busy: false, token: captured.token,
        message: 'Select cells to paint. Press Esc to stop.' })
      return true
    } catch (error) {
      if (get(formatPainterAtom).session === session)
        set(painterStateAtom, { ...IDLE, error: true,
          message: `Could not capture formatting: ${clipboardErrorMessage(error)}` })
      return false
    }
  }
  if (state.mode === 'idle' || !state.token) return false
  set(painterStateAtom, { ...state, busy: true, error: false, message: 'Painting formatting…' })
  // 原生仅格式粘贴已经负责完整替换、平铺、保护、合并格、历史及同次回包投影。
  const applied = await set(runSystemClipboardAtom, { operation: 'paste', mode: 'formats',
    read: async () => ({ text: '', token: state.token, painter: true }) })
  if (get(formatPainterAtom).session !== state.session) return applied
  set(painterStateAtom, applied
    ? state.mode === 'armed' ? { ...IDLE, message: 'Formatting applied.' }
      : { ...state, busy: false, error: false, message: 'Formatting applied. Select another range; Esc to stop.' }
    : { ...state, busy: false, error: true,
      message: get(systemClipboardFeedbackAtom).message.replace('Nothing was pasted.', 'No formatting was applied.')
        || 'Formatting was not applied. Select cells and retry.' })
  return applied
})
runFormatPainterAtom.debugLabel = 'spreadsheet.runFormatPainter'
