import { atom } from '@einfach/core'
import { commitCellEditingAtom } from '../editing/commit-cell-editing'
import { editingDraftAtom, editingSessionAtom } from '../editing/session-atoms'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import { formulaReferenceSessionBackingAtom } from '../formula-reference/state'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
} from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import {
  activeWorkbookSheetAtom,
  publishWorkbookSheetAtom,
  publishWorkbookSheetStructureAtom,
  workbookDocumentAtom,
} from '../runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { rustHistoryPanelAtom } from '../history/rust-history-command'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { dispatchSheetTabIntentAtom } from './basic-commands'
import { nextSheetTabName } from './metadata'
import { sheetTabsAtom } from './state'
import { selectionSnapshotAtom } from '../selection'

export type WorkbookSheetCommand =
  | {
      readonly operation:
        | 'add'
        | 'rename'
        | 'cancel-rename'
        | 'request-delete'
        | 'cancel-delete'
        | 'delete'
        | 'move-left'
        | 'move-right'
    }
  | { readonly operation: 'switch' | 'begin-rename'; readonly sheetId: string }
  | { readonly operation: 'change-name'; readonly name: string }

/** 当前 Rust 工作簿的标签操作；复用既有草稿/错误状态，不接旧 backend ports。 */
export const runWorkbookSheetCommandAtom = atom(
  null,
  async (get, set, input: WorkbookSheetCommand): Promise<boolean> => {
    const connection = get(rustWorkbookConnectionAtom)
    const state = get(sheetTabsAtom)
    if (
      !connection ||
      get(activeEditingCommitTicketAtom) !== null ||
      state.mutation ||
      get(systemClipboardFeedbackAtom).busy ||
      get(rustHistoryPanelAtom).busy ||
      get(selectionStructureFeedbackAtom).busy || get(selectionMergeFeedbackAtom).busy
    )
      return false
    if (input.operation === 'cancel-delete') {
      set(sheetTabsAtom, { ...state, deleteConfirmation: null, error: null })
      return true
    }
    if (input.operation === 'cancel-rename') {
      set(sheetTabsAtom, { ...state, rename: null, error: null })
      return true
    }
    if (input.operation === 'change-name') {
      if (!state.rename) return false
      set(dispatchSheetTabIntentAtom, {
        type: 'sheet-tab.rename.change',
        sheetId: state.rename.sheetId,
        draftName: input.name,
      })
      set(sheetTabsAtom, { ...get(sheetTabsAtom), error: null })
      return true
    }
    const active = get(activeWorkbookSheetAtom)
    const workbook = get(workbookDocumentAtom)
    if (!active) return false
    const target =
      input.operation === 'delete'
        ? workbook.sheets.find((sheet) => sheet.id === state.deleteConfirmation?.sheetId)
        : 'sheetId' in input
          ? workbook.sheets.find((sheet) => sheet.id === input.sheetId)
          : active
    if (!target) return false
    const deleting = input.operation === 'delete'
    const moving = input.operation === 'move-left' || input.operation === 'move-right'
    const structural = deleting || moving
    const targetIndex = target.index + (input.operation === 'move-left' ? -1 : 1)
    if ((deleting || input.operation === 'request-delete') && workbook.sheets.length <= 1) {
      set(sheetTabsAtom, { ...state, error: 'Keep at least one worksheet.' })
      return false
    }
    if (moving && (targetIndex < 0 || targetIndex >= workbook.sheets.length)) return false

    const reference = get(formulaReferenceSessionBackingAtom)
    const editing = get(editingSessionAtom)
    // 拾取期间只允许浏览其它表，不能删除/重命名正在引用的表。
    if ((reference || (editing.source && editing.source.sheetId !== active.id)) &&
      input.operation !== 'switch') return false
    if (reference && input.operation === 'switch') {
      if (target.id === active.id) return true
      if (!editing.source) return false
      // 格内输入在另一张表上没有对应位置；共用公式栏继续编辑同一份草稿。
      set(editingDraftAtom, { draft: editing.draft, source: 'formula-bar' })
      set(activateWorkbookSheetAtom, target, { reference: true })
      set(formulaReferenceSessionBackingAtom, {
        ...reference, sheetId: target.id, anchorCell: get(selectionSnapshotAtom).activeCell,
        pickAnchor: null, pickFocus: null, dragging: false,
      })
      set(sheetTabsAtom, {
        ...get(sheetTabsAtom), rename: null, error: null, deleteConfirmation: null,
      })
      return true
    }

    // 切换前沿用原提交命令；错误保留草稿，不让它写到下一个工作表。
    if (get(editingSessionAtom).source !== null) {
      if ((await set(commitCellEditingAtom, { returnToSource: false })) !== 'completed') return false
      if (
        get(rustWorkbookConnectionAtom) !== connection ||
        get(activeWorkbookSheetAtom)?.id !== active.id
      )
        return false
    }
    if (input.operation === 'begin-rename') {
      set(dispatchSheetTabIntentAtom, {
        type: 'sheet-tab.rename.begin',
        sheetId: target.id,
        draftName: target.name,
        source: 'programmatic',
      })
      return true
    }
    if (input.operation === 'request-delete') {
      set(sheetTabsAtom, {
        ...get(sheetTabsAtom),
        rename: null,
        error: null,
        deleteConfirmation: { sheetId: target.id, sheetName: target.name },
      })
      return true
    }
    if (input.operation === 'switch') {
      // 同表的临时引用浏览也需回到普通视图；普通重复点击由切表命令直接忽略。
      set(activateWorkbookSheetAtom, target)
      set(sheetTabsAtom, {
        ...get(sheetTabsAtom),
        rename: null,
        error: null,
        deleteConfirmation: null,
      })
      return true
    }
    const rename = get(sheetTabsAtom).rename
    if (input.operation === 'rename' && !rename) return false
    const name = structural
      ? ''
      : input.operation === 'add'
        ? nextSheetTabName(workbook.sheets)
        : rename!.draftName
    const sheetId = structural
      ? target.id
      : input.operation === 'rename'
        ? rename!.sheetId
        : undefined
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return false
    const witness = get(projectionSnapshotAtom)
    const projection =
      input.operation !== 'add' &&
      !(deleting && target.id === active.id) &&
      witness.request?.kind === 'visible-window'
        ? createVisibleProjectionRequest({ ...witness.request, requestId })
        : undefined
    set(sheetTabsAtom, {
      ...get(sheetTabsAtom),
      error: null,
      mutation: {
        kind: deleting ? 'delete' : moving ? 'reorder' : input.operation,
        phase: 'pending',
        requestId,
        sessionId: state.sessionId,
        sheetId: sheetId ?? null,
        activeSheetIdAtDispatch: active.id,
      },
    })
    try {
      if (structural) {
        const result = await connection.request(
          'workbook.changeSheets',
          deleting
            ? { operation: 'delete', sheetId: target.id, projection }
            : { operation: 'move', sheetId: target.id, targetIndex, projection },
        )
        if (get(rustWorkbookConnectionAtom) !== connection) return false
        set(publishWorkbookSheetStructureAtom, result.sheets)
        if (deleting && active.id === target.id) {
          const next =
            get(workbookDocumentAtom).sheets[Math.min(target.index, result.sheets.length - 1)]
          if (next) set(activateWorkbookSheetAtom, next)
        }
        if (projection && result.projection)
          set(applyVisibleProjectionAtom, {
            witness,
            request: projection,
            result: result.projection,
          })
        set(sheetTabsAtom, {
          ...get(sheetTabsAtom),
          mutation: null,
          rename: null,
          error: null,
          deleteConfirmation: null,
        })
        return true
      }
      const result = await connection.request('workbook.editSheet', {
        name,
        sheetId,
        projection,
        ...(input.operation === 'add'
          ? { rowCount: active.rowCount, colCount: active.colCount }
          : {}),
      })
      if (get(rustWorkbookConnectionAtom) !== connection) return false
      const previous = sheetId ? workbook.sheets.find((sheet) => sheet.id === sheetId) : undefined
      // 新表是空白画布；尺寸沿用当前工作簿的画布范围，不复制任何单元格。
      const sheet = {
        ...result.sheet,
        rowCount: previous?.rowCount ?? active.rowCount,
        colCount: previous?.colCount ?? active.colCount,
      }
      set(publishWorkbookSheetAtom, sheet)
      if (input.operation === 'add') set(activateWorkbookSheetAtom, sheet)
      if (projection && result.projection)
        set(applyVisibleProjectionAtom, { witness, request: projection, result: result.projection })
      set(sheetTabsAtom, { ...get(sheetTabsAtom), mutation: null, rename: null, error: null })
      return true
    } catch (error) {
      if (get(rustWorkbookConnectionAtom) === connection) {
        set(sheetTabsAtom, {
          ...get(sheetTabsAtom),
          mutation: null,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return false
    }
  },
)
