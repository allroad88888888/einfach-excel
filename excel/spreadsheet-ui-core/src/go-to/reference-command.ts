import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionSnapshotAtom } from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import { rangeToA1 } from '../name-box'
import { parseGoToReference } from './reference-parser'
import {
  applyGoToTargetAtom, closeGoToAtom, goToHistoryAtom, goToInputAtom, goToOpenAtom,
  openGoToAtom, pushGoToHistoryAtom, setGoToErrorDetailsAtom, setGoToInputAtom,
} from './index'

/** 定位只是 UI 导航；数据仍由既有可见窗口请求从 Rust 读取。 */
export const goToReferenceAvailableAtom = atom((get) => Boolean(
  get(rustWorkbookConnectionAtom) && get(activeWorkbookSheetAtom) &&
  !get(editingSessionAtom).source && !get(activeEditingCommitTicketAtom) &&
  !get(sheetTabsAtom).mutation && !get(systemClipboardFeedbackAtom).busy &&
  !get(rustHistoryPanelAtom).busy && !get(selectionStructureFeedbackAtom).busy &&
  !get(selectionMergeFeedbackAtom).busy,
))

export type GoToReferenceAction = 'open' | 'close' | 'submit'
  | { input: string } | { recent: string }

/** 共用原定位会话，不为 React 再建立一套草稿、历史或工作簿缓存。 */
export const runGoToReferenceAtom = atom(null, (get, set, action: GoToReferenceAction): boolean => {
  if (action === 'close') {
    set(closeGoToAtom)
    return true
  }
  if (!get(goToReferenceAvailableAtom)) return false
  if (action === 'open') {
    if (!get(goToOpenAtom)) set(openGoToAtom)
    return true
  }
  if (!get(goToOpenAtom)) return false
  if (typeof action === 'object' && 'input' in action) {
    set(setGoToInputAtom, action.input.slice(0, 1024))
    return true
  }
  const fail = (message: string) => {
    set(setGoToErrorDetailsAtom, { code: 'goTo.error.invalidReference', params: null, message })
    return false
  }
  const recent = typeof action === 'object' ? action.recent : null
  if (recent !== null && !get(goToHistoryAtom).includes(recent))
    return fail('This recent location is no longer available.')
  const active = get(activeWorkbookSheetAtom)!
  const sheets = get(workbookDocumentAtom).sheets
  const parsed = parseGoToReference(recent ?? get(goToInputAtom), {
    activeSheetId: active.id, activeCell: get(selectionSnapshotAtom).activeCell,
    sheets, registry: [],
  })
  if (!parsed.ok) return fail('Enter a valid A1 or R1C1 reference, optionally prefixed by a worksheet name.')
  const { target } = parsed
  const sheet = sheets.find((item) => item.id === target.sheetId)
  const range = target.range ?? (target.coord ? {
    rowStart: target.coord.row, rowEnd: target.coord.row,
    colStart: target.coord.col, colEnd: target.coord.col,
  } : null)
  if (!sheet || !range || range.rowEnd >= sheet.rowCount || range.colEnd >= sheet.colCount)
    return fail('This address is outside the current worksheet canvas.')
  // 先校验完整目标，再切换表；错误不能改变原选区、滚动位置或历史。
  if (sheet.id !== active.id) set(activateWorkbookSheetAtom, sheet)
  set(applyGoToTargetAtom, target)
  set(scrollToCellAtom, {
    coord: { row: range.rowStart, col: range.colStart }, rowAlign: 'start', colAlign: 'nearest',
  })
  // R1C1 与裸 A1 均固定为当时的绝对坐标，最近记录不会随活动单元格漂移。
  set(pushGoToHistoryAtom, `'${sheet.name.replace(/'/g, "''")}'!${rangeToA1(range)}`)
  set(closeGoToAtom)
  return true
})
