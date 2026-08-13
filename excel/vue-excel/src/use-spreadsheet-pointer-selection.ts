import {
  cancelPointerAtom,
  commitPointerAtom,
  selectCellAtom,
  startPointerAtom,
  updatePointerAtom,
  type CellCoord,
} from '@einfach/spreadsheet-ui-core'
import { getCurrentScope, onScopeDispose } from 'vue'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'

/** A cell that starts a spreadsheet pointer-selection drag. */
export interface SpreadsheetPointerSelectionStart {
  readonly sheetId: string
  readonly coord: CellCoord
}

interface ActivePointerSelection {
  readonly pointerId: number | undefined
  readonly sheetId: string
  readonly store: ReturnType<typeof useSpreadsheetUiCore>['value']['store']
}

/** Pointer handlers that translate one native drag into UI-core selection atoms. */
export interface SpreadsheetPointerSelection {
  onPointerDown: (event: PointerEvent, start: SpreadsheetPointerSelectionStart) => void
  onPointerMove: (event: PointerEvent, focus: CellCoord) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
}

function matchesPointer(pointerId: number | undefined, event: PointerEvent): boolean {
  return pointerId === undefined || event.pointerId === undefined || event.pointerId === pointerId
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === 0 && event.isPrimary !== false
}

/**
 * Maps caller-bound pointer handlers to the nearest provider's canonical
 * selection and pointer atoms. Vue only owns the temporary native stream.
 */
export function useSpreadsheetPointerSelection(): SpreadsheetPointerSelection {
  const core = useSpreadsheetUiCore()
  let active: ActivePointerSelection | undefined

  const cancelActive = () => {
    if (active === undefined) return
    const { store } = active
    active = undefined
    store.setter(cancelPointerAtom)
  }

  const onPointerDown = (event: PointerEvent, start: SpreadsheetPointerSelectionStart) => {
    if (!isPrimaryPointer(event)) return

    cancelActive()
    const store = core.value.store
    store.setter(selectCellAtom, { sheetId: start.sheetId, coord: start.coord })
    store.setter(startPointerAtom, {
      kind: 'drag-selection',
      sheetId: start.sheetId,
      anchor: start.coord,
      focus: start.coord,
      source: 'pointer',
    })
    active = { pointerId: event.pointerId, sheetId: start.sheetId, store }
  }

  const onPointerMove = (event: PointerEvent, focus: CellCoord) => {
    if (active === undefined || !matchesPointer(active.pointerId, event)) return

    active.store.setter(selectCellAtom, {
      sheetId: active.sheetId,
      coord: focus,
      extend: true,
    })
    active.store.setter(updatePointerAtom, { kind: 'drag-selection', focus })
  }

  const onPointerUp = (event: PointerEvent) => {
    if (active === undefined || !matchesPointer(active.pointerId, event)) return
    const { store } = active
    active = undefined
    store.setter(commitPointerAtom)
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (active === undefined || !matchesPointer(active.pointerId, event)) return
    cancelActive()
  }

  if (getCurrentScope()) onScopeDispose(cancelActive)

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
