import { atom } from '@einfach/core'
import { commitCellEditingAtom } from '../editing/commit-cell-editing'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { scrollToCellAtom } from '../viewport/metrics'
import {
  getActiveCell,
  setSelectionAtom,
  selectionSnapshotAtom,
  selectionAuthorityWitnessAtom,
  type SelectionState,
} from './index'

export type GridHeaderSelectionInput =
  | { readonly kind: 'all'; readonly sheetId: string }
  | {
      readonly kind: 'row' | 'column'
      readonly sheetId: string
      readonly index: number
      readonly extend?: boolean
    }

/** 表头选择先提交当前编辑，再复用整行/整列选区，最后露出活动格。 */
export const selectGridHeaderAtom = atom(
  null,
  async (get, set, input: GridHeaderSelectionInput): Promise<boolean> => {
    const sheet = get(activeWorkbookSheetAtom)
    if (sheet?.id !== input.sheetId) return false
    if (
      input.kind !== 'all' &&
      (!Number.isInteger(input.index) ||
        input.index < 0 ||
        input.index >= (input.kind === 'row' ? sheet.rowCount : sheet.colCount))
    )
      return false

    const witness = get(selectionSnapshotAtom)
    const selectionAuthority = get(selectionAuthorityWitnessAtom)
    if (get(editingSessionAtom).source !== null) {
      const outcome = await set(commitCellEditingAtom)
      if (
        outcome !== 'completed' ||
        get(selectionAuthorityWitnessAtom) !== selectionAuthority ||
        get(activeWorkbookSheetAtom)?.id !== input.sheetId
      )
        return false
    }

    const current = witness.selection
    let selection: SelectionState
    if (input.kind === 'row') {
      selection = {
        kind: 'row',
        sheetId: input.sheetId,
        rowAnchor:
          input.extend && current.kind === 'row' && current.sheetId === input.sheetId
            ? current.rowAnchor
            : input.index,
        rowFocus: input.index,
      }
    } else if (input.kind === 'column') {
      selection = {
        kind: 'column',
        sheetId: input.sheetId,
        colAnchor:
          input.extend && current.kind === 'column' && current.sheetId === input.sheetId
            ? current.colAnchor
            : input.index,
        colFocus: input.index,
      }
    } else {
      selection = { kind: 'all', sheetId: input.sheetId }
    }
    set(setSelectionAtom, selection)
    // 整列的活动格位于首行，整行的活动格位于首列：保证格式回显与键盘编辑有可见投影。
    // 用本次目标计算位置，不在同一写事务里读取尚未重算的派生 atom。
    set(scrollToCellAtom, { coord: getActiveCell(selection, sheet) })
    return true
  },
)
selectGridHeaderAtom.debugLabel = 'spreadsheet.selection.selectGridHeader'
