import type { Getter, Setter } from '@einfach/core'
import type { BackendStructuralShift } from '../backend/types'
import type { HistoryLocalReplayPayload } from '../history'
import {
  applyOutlineStructuralShiftAtom,
  getOutlineGroupsForSheet,
  OUTLINE_REPLAY_KEY,
  outlineAtom,
  type OutlineGroup,
} from '../outline'
import {
  applyViewportFreezeStructuralShiftAtom,
  getViewportFreezeForSheet,
  VIEWPORT_FREEZE_REPLAY_KEY,
  viewportFreezeAtom,
} from '../viewport/freeze'
import {
  applyViewportHiddenStructuralShiftAtom,
  getHiddenColumnsForSheet,
  getHiddenRowsForSheet,
  VIEWPORT_HIDDEN_REPLAY_KEY,
  viewportHiddenAtom,
} from '../viewport/hidden'
import { applyViewportFilterHiddenStructuralShiftAtom } from '../viewport/effective-hidden'

function sameIndexArrays(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, offset) => value === right[offset])
}

function sameOutlineGroupArrays(
  left: readonly OutlineGroup[],
  right: readonly OutlineGroup[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (group, offset) =>
        group.start === right[offset].start &&
        group.end === right[offset].end &&
        group.collapsed === right[offset].collapsed,
    )
  )
}

/** Shift canonical view facts for one acknowledged structure mutation; returns replay payloads. */
export function shiftStructureViewFacts(
  get: Getter,
  set: Setter,
  sheetId: string,
  structuralShift: Readonly<BackendStructuralShift> | undefined,
): HistoryLocalReplayPayload[] {
  const freezeBefore = getViewportFreezeForSheet(get(viewportFreezeAtom), sheetId)
  const hiddenStateBefore = get(viewportHiddenAtom)
  const hiddenRowsBefore = getHiddenRowsForSheet(hiddenStateBefore, sheetId)
  const hiddenColsBefore = getHiddenColumnsForSheet(hiddenStateBefore, sheetId)
  const outlineStateBefore = get(outlineAtom)
  const outlineRowsBefore = getOutlineGroupsForSheet(outlineStateBefore, sheetId, 'row')
  const outlineColsBefore = getOutlineGroupsForSheet(outlineStateBefore, sheetId, 'column')
  if (structuralShift) {
    set(applyViewportFreezeStructuralShiftAtom, {
      sheetId,
      shift: structuralShift,
    })
    set(applyViewportHiddenStructuralShiftAtom, {
      sheetId,
      shift: structuralShift,
    })
    set(applyViewportFilterHiddenStructuralShiftAtom, {
      sheetId,
      shift: structuralShift,
    })
    set(applyOutlineStructuralShiftAtom, {
      sheetId,
      shift: structuralShift,
    })
  }
  const localSidePayloads: HistoryLocalReplayPayload[] = []
  const freezeAfter = getViewportFreezeForSheet(get(viewportFreezeAtom), sheetId)
  if (
    (freezeBefore === null) !== (freezeAfter === null) ||
    (freezeBefore !== null &&
      freezeAfter !== null &&
      (freezeBefore.rows !== freezeAfter.rows || freezeBefore.cols !== freezeAfter.cols))
  ) {
    localSidePayloads.push({
      applyKey: VIEWPORT_FREEZE_REPLAY_KEY,
      sheetId,
      before: freezeBefore,
      after: freezeAfter,
    })
  }
  const hiddenStateAfter = get(viewportHiddenAtom)
  const hiddenRowsAfter = getHiddenRowsForSheet(hiddenStateAfter, sheetId)
  const hiddenColsAfter = getHiddenColumnsForSheet(hiddenStateAfter, sheetId)
  if (
    !sameIndexArrays(hiddenRowsBefore, hiddenRowsAfter) ||
    !sameIndexArrays(hiddenColsBefore, hiddenColsAfter)
  ) {
    localSidePayloads.push({
      applyKey: VIEWPORT_HIDDEN_REPLAY_KEY,
      sheetId,
      before: { rows: [...hiddenRowsBefore], cols: [...hiddenColsBefore] },
      after: { rows: [...hiddenRowsAfter], cols: [...hiddenColsAfter] },
    })
  }
  // FILTER-hidden rows carry NO history side payload since E8. The engine owns
  // the filter (rules + derived hidden set) and its own `restoreFilters`
  // snapshot restores it on undo/redo; UI core re-hydrates the render cache
  // (`viewportFilterHiddenAtom`) from the engine afterwards
  // (`readSheetHiddenState.filterRows`) — see the provider's undo/redo refresh.
  // The forward shift above is the optimistic same-tick projection only.
  const outlineStateAfter = get(outlineAtom)
  const outlineRowsAfter = getOutlineGroupsForSheet(outlineStateAfter, sheetId, 'row')
  const outlineColsAfter = getOutlineGroupsForSheet(outlineStateAfter, sheetId, 'column')
  if (
    !sameOutlineGroupArrays(outlineRowsBefore, outlineRowsAfter) ||
    !sameOutlineGroupArrays(outlineColsBefore, outlineColsAfter)
  ) {
    localSidePayloads.push({
      applyKey: OUTLINE_REPLAY_KEY,
      sheetId,
      before: { rows: [...outlineRowsBefore], cols: [...outlineColsBefore] },
      after: { rows: [...outlineRowsAfter], cols: [...outlineColsAfter] },
    })
  }
  return localSidePayloads
}
