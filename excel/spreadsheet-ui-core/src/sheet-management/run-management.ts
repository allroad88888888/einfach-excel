import type { Getter, Setter } from '@einfach/core'
import type { VisibleProjectionRequest } from '../contracts'
import { commitCellEditingAtom } from '../editing/commit-cell-editing'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import { editingSessionAtom } from '../editing/session-atoms'
import { formulaReferenceSessionBackingAtom } from '../formula-reference/state'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import {
  activeWorkbookSheetAtom,
  publishWorkbookSheetStructureAtom,
  workbookDocumentAtom,
} from '../runtime/workbook-document'
import { groupedSheetIdsBackingAtom } from '../runtime/sheet-view-state'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { workspaceSessionAtom } from '../workspace'
import { nearestVisibleSheet } from './visible-sheets'

export type SheetManagementPayload =
  | { readonly command: 'workbook.duplicateSheet' }
  | { readonly command: 'workbook.setSheetHidden'; readonly hidden: boolean }
  | { readonly command: 'workbook.setSheetTabColor'; readonly color: string | null }

export interface SheetManagementSpec {
  readonly sheetId: string
  readonly payload: SheetManagementPayload
}

type Connection = NonNullable<ReturnType<typeof readConnection>>
const readConnection = (get: Getter) => get(rustWorkbookConnectionAtom)

function request(
  connection: Connection,
  spec: SheetManagementSpec,
  projection: VisibleProjectionRequest | undefined,
) {
  const base = { sheetId: spec.sheetId, projection }
  const { payload } = spec
  if (payload.command === 'workbook.duplicateSheet')
    return connection.request(payload.command, base)
  if (payload.command === 'workbook.setSheetHidden')
    return connection.request(payload.command, { ...base, hidden: payload.hidden })
  return connection.request(payload.command, { ...base, color: payload.color })
}

/**
 * 复制/隐藏/颜色共用的一次 Rust 往返：门禁 → 提交未完成编辑 → 单次请求 →
 * 发布 Rust 返回的表目录。结构与撤销语义全部由 Rust 决定。
 */
export async function runSheetManagement(
  get: Getter,
  set: Setter,
  spec: SheetManagementSpec,
): Promise<boolean> {
  const connection = readConnection(get)
  const state = get(sheetTabsAtom)
  if (
    !connection ||
    state.mutation ||
    get(activeEditingCommitTicketAtom) !== null ||
    get(systemClipboardFeedbackAtom).busy ||
    get(rustHistoryPanelAtom).busy ||
    get(selectionStructureFeedbackAtom).busy ||
    get(selectionMergeFeedbackAtom).busy ||
    get(formulaReferenceSessionBackingAtom)
  )
    return false
  const active = get(activeWorkbookSheetAtom)
  const target = get(workbookDocumentAtom).sheets.find((sheet) => sheet.id === spec.sheetId)
  if (!active || !target) return false
  const editing = get(editingSessionAtom)
  if (editing.source && editing.source.sheetId !== active.id) return false
  if (editing.source) {
    if ((await set(commitCellEditingAtom, { returnToSource: false })) !== 'completed') return false
    if (readConnection(get) !== connection || get(activeWorkbookSheetAtom)?.id !== active.id)
      return false
  }
  const requestId = set(issueProjectionRequestIdAtom)
  if (requestId === null) return false
  // 活动表被隐藏或切换到副本时没有可保留的旧窗口，由新活动表自己读取投影。
  const leaves =
    spec.payload.command === 'workbook.duplicateSheet' ||
    (spec.payload.command === 'workbook.setSheetHidden' &&
      spec.payload.hidden &&
      spec.sheetId === active.id)
  const witness = get(projectionSnapshotAtom)
  const projection =
    !leaves && witness.request?.kind === 'visible-window'
      ? createVisibleProjectionRequest({ ...witness.request, requestId })
      : undefined
  set(sheetTabsAtom, {
    ...get(sheetTabsAtom),
    error: null,
    contextMenu: null,
    mutation: {
      // 仅作忙碌标记：复制属于新增，隐藏/颜色属于工作表属性编辑。
      kind: spec.payload.command === 'workbook.duplicateSheet' ? 'add' : 'rename',
      phase: 'pending',
      requestId,
      sessionId: state.sessionId,
      sheetId: spec.sheetId,
      activeSheetIdAtDispatch: get(workspaceSessionAtom).activeSheetId,
    },
  })
  try {
    const result = await request(connection, spec, projection)
    if (readConnection(get) !== connection) return false
    set(publishWorkbookSheetStructureAtom, result.sheets)
    const sheets = get(workbookDocumentAtom).sheets
    if (spec.payload.command === 'workbook.duplicateSheet') {
      const copy = sheets.find((sheet) => sheet.id === result.sheetId)
      if (copy) {
        set(groupedSheetIdsBackingAtom, [copy.id])
        set(activateWorkbookSheetAtom, copy)
      }
    } else if (leaves) {
      const remaining = get(groupedSheetIdsBackingAtom)
      const next =
        sheets.find((sheet) => !sheet.hidden && remaining.includes(sheet.id)) ??
        nearestVisibleSheet(sheets, target.index, target.id)
      if (next) set(activateWorkbookSheetAtom, next)
    }
    if (projection && result.projection)
      set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
    set(sheetTabsAtom, { ...get(sheetTabsAtom), mutation: null, error: null })
    return true
  } catch (error) {
    if (readConnection(get) === connection)
      set(sheetTabsAtom, {
        ...get(sheetTabsAtom),
        mutation: null,
        error: error instanceof Error ? error.message : String(error),
      })
    return false
  }
}
