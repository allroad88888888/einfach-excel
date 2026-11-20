import type { Getter, Setter } from '@einfach/core'
import { refreshSheetDrawingsAtom, selectDrawingAtom, sheetDrawingsAtom } from '../drawings/state'
import { scrollToCellAtom } from '../viewport/metrics'
import { closeGoToAtom } from './session-commands'
import {
  EMPTY_GO_TO_ERROR,
  IDLE_SPECIAL_SCAN,
  goToErrorStateAtom,
  goToSpecialScanStateAtom,
} from './session-state'
import { explicitSpecialError } from './value-snapshots'

export interface LocateObjectsOutcome {
  readonly count: number
  readonly firstId: string | null
}

/** 定位当前表的浮动对象：若存在则激活首个对象选中态并滚动至可见，无对象保持当前选区不变。 */
export async function locateSheetObjects(
  get: Getter,
  set: Setter,
): Promise<LocateObjectsOutcome> {
  await set(refreshSheetDrawingsAtom)
  const drawings = get(sheetDrawingsAtom)
  if (drawings.length === 0) {
    return { count: 0, firstId: null }
  }
  const first = drawings[0]!
  set(selectDrawingAtom, first.id)
  set(scrollToCellAtom, {
    coord: { row: first.anchor.row, col: first.anchor.col },
    rowAlign: 'nearest',
    colAlign: 'nearest',
  })
  return { count: drawings.length, firstId: first.id }
}

export async function runObjectsSessionScan(
  get: Getter,
  set: Setter,
  isCurrent: () => boolean,
): Promise<void> {
  const objects = await locateSheetObjects(get, set)
  if (!isCurrent()) return
  set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
  if (objects.count === 0) {
    set(
      goToErrorStateAtom,
      explicitSpecialError('goTo.error.noObjects', 'No floating objects found on this worksheet.'),
    )
    return
  }
  set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
  set(closeGoToAtom)
}
