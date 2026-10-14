import { atom, type Getter, type Setter } from '@einfach/core'
import { getSourceTextFromProjection } from '../projection/editable-source-text'
import { projectionSnapshotAtom } from '../projection'
import type { CellCoord } from '../shared'
import { editingSessionAtom, returnToEditingSource, startEditingAtom } from './session-atoms'
import { activeEditingCommitTicketAtom, editingCommitLifecycleAtom } from './commit-state'
import { selectionAuthorityWitnessAtom } from '../selection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import type { EditingInputSource } from './types'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { mergeRangeAt } from '../shared/merge'
import { nativeTableFeedbackAtom } from '../tables/native-feedback'
import { getAxisSpanSize } from '../viewport/axis-geometry'

export interface StartCellEditingFromProjectionInput {
  readonly sheetId: string
  readonly cell: CellCoord
  readonly source?: EditingInputSource
  readonly initialDraft?: string
  /** 双击发生在失焦提交期间时，等待这笔已有写入，不自动重试。 */
  readonly waitForPending?: boolean
  /** 展现层判断延迟操作是否仍有效；Core 不读取 DOM 或焦点。 */
  readonly isCurrent?: () => boolean
}

/** Starts a cell draft from the source text owned by the current projection. */
export const startCellEditingFromProjectionAtom = atom(
  null,
  (get, set, input: StartCellEditingFromProjectionInput): boolean | Promise<boolean> => {
    if (input.isCurrent?.() === false) return false
    const ticket = get(activeEditingCommitTicketAtom)
    if (input.waitForPending && ticket && get(editingCommitLifecycleAtom).status === 'pending') {
      const selection = get(selectionAuthorityWitnessAtom)
      const connection = get(rustWorkbookConnectionAtom)
      const sheet = get(activeWorkbookSheetAtom)
      return ticket.completion.then((outcome) => {
        // 用户已经选了别处、换了表或离开当前界面，就丢弃迟到的双击意图。
        if (
          input.isCurrent?.() === false ||
          get(selectionAuthorityWitnessAtom) !== selection ||
          get(rustWorkbookConnectionAtom) !== connection ||
          get(activeWorkbookSheetAtom) !== sheet
        )
          return false
        if (outcome !== 'completed' && outcome !== 'rejected') return false
        return startFromProjection(get, set, input)
      })
    }
    return startFromProjection(get, set, input)
  },
)

/** 普通开始与等待后的开始共用同一套草稿所有权检查。 */
function startFromProjection(
  get: Getter,
  set: Setter,
  input: StartCellEditingFromProjectionInput,
): boolean {
  const session = get(editingSessionAtom)
  // 新编辑不能覆盖未保存的草稿；拒绝后再次双击应回到原格供修正或取消。
  if (session.source !== null) {
    if (get(editingCommitLifecycleAtom).status === 'rejected')
      returnToEditingSource(get, set, session)
    return false
  }
  if (
    get(selectionStructureFeedbackAtom).busy ||
    get(selectionMergeFeedbackAtom).busy ||
    get(nativeTableFeedbackAtom).busy
  )
    return false
  const result = get(projectionSnapshotAtom).result
  const merge =
    result?.kind === 'visible-window' && result.sheetId === input.sheetId
      ? mergeRangeAt(result.mergedRanges ?? [], input.cell)
      : undefined
  const cell = merge ? { row: merge.rowStart, col: merge.colStart } : input.cell
  const sizes = get(viewportGeometrySizesAtom)
  // 可点击的是整个合并框；锚点行/列隐藏，不代表剩余部分也不可编辑。
  // 这里只判断尺寸是否为零，未设置尺寸的索引用任意正数即可。
  const rowStart = merge?.rowStart ?? cell.row
  const rowEnd = merge?.rowEnd ?? cell.row
  const colStart = merge?.colStart ?? cell.col
  const colEnd = merge?.colEnd ?? cell.col
  if (
    getAxisSpanSize(rowStart, rowEnd, rowEnd + 1, 1, sizes.rowHeightsBySheet[input.sheetId]) ===
      0 ||
    getAxisSpanSize(colStart, colEnd, colEnd + 1, 1, sizes.colWidthsBySheet[input.sheetId]) === 0
  )
    return false
  const sourceText =
    result?.kind === 'visible-window'
      ? getSourceTextFromProjection(result, cell, input.sheetId)
      : undefined
  if (sourceText === undefined) return false

  set(startEditingAtom, {
    sheetId: input.sheetId,
    cell,
    draft: input.initialDraft ?? sourceText,
    source: input.source ?? 'cell',
  })
  return true
}

startCellEditingFromProjectionAtom.debugLabel = 'spreadsheet.editing.startCellFromProjection'
