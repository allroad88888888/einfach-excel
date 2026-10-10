import { atom, type Store } from '@einfach/core'
import type { FormulaReferenceArrowPickIntent, KeyboardInput } from '../keyboard'
import { getKeyboardMovementIntent } from '../keyboard/keyboard-movement'
import { selectionBoundsAtom } from '../selection'
import {
  sheetHiddenRowsBackingAtom,
  viewportHiddenColsBackingAtom,
  viewportFilterHiddenBackingAtom,
} from '../viewport/hidden-state'
import { scrollToCellAtom, viewportMetricsAtom } from '../viewport/metrics'
import { projectionSnapshotBackingAtom } from '../projection/state'
import { mergeRangeAt } from '../shared/merge'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import {
  formulaReferenceCaretAtom,
  formulaReferenceSessionAtom,
  pickFormulaReferenceAtom,
} from './index'

/** 用现有导航算法移动引用框；不动工作簿选区，不发写入请求。 */
export const moveFormulaReferenceAtom = atom(
  null,
  (get, set, input: KeyboardInput): number | null => {
    const session = get(formulaReferenceSessionAtom)
    if (
      !session ||
      get(activeEditingCommitTicketAtom) !== null ||
      input.isComposing ||
      input.ctrlKey ||
      input.metaKey ||
      input.altKey ||
      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(input.key)
    )
      return null
    const focus = session.pickFocus ?? session.anchorCell
    const projection = get(projectionSnapshotBackingAtom).result
    const merges =
      projection?.kind === 'visible-window' && projection.sheetId === session.sheetId
        ? (projection.mergedRanges ?? [])
        : []
    const move = getKeyboardMovementIntent(
      {
        ...input,
        resolveMergeRange: (row, col) => mergeRangeAt(merges, { row, col }) ?? null,
      },
      {
        mode: 'navigation',
        bounds: get(selectionBoundsAtom),
        selection: {
          kind: 'range',
          sheetId: session.sheetId,
          anchor: session.pickAnchor ?? focus,
          focus,
        },
        // 与普通键盘导航一样读取原生隐藏投影，不引入旧隐藏命令的完整模块。
        hiddenRows: new Set([
          ...(get(sheetHiddenRowsBackingAtom)[session.sheetId] ?? []),
          ...(get(viewportFilterHiddenBackingAtom).rowsBySheet[session.sheetId] ?? []),
        ]),
        hiddenColumns: new Set(get(viewportHiddenColsBackingAtom)[session.sheetId]),
      },
    )
    if (
      move.type !== 'selection.move' ||
      (move.selection.kind !== 'cell' && move.selection.kind !== 'range')
    )
      return null
    set(pickFormulaReferenceAtom, {
      sheetId: session.sheetId,
      pickAnchor: move.selection.anchor,
      pickFocus: move.selection.focus,
      dragging: false,
      preserveLocks: true,
    })
    if (get(viewportMetricsAtom).sheetId === session.sheetId)
      set(scrollToCellAtom, { coord: move.to })
    return get(formulaReferenceCaretAtom)
  },
)

/** Applies a keyboard arrow intent to the active formula-reference pick. */
export function applyFormulaReferenceArrowPick(
  store: Store,
  intent: FormulaReferenceArrowPickIntent,
): void {
  store.setter(moveFormulaReferenceAtom, {
    key: intent.rowDelta
      ? intent.rowDelta < 0
        ? 'ArrowUp'
        : 'ArrowDown'
      : intent.colDelta < 0
        ? 'ArrowLeft'
        : 'ArrowRight',
    shiftKey: intent.extend,
  })
}
