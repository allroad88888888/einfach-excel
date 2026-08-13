import {
  cancelPointerAtom,
  commitPointerAtom,
  selectCellAtom,
  startPointerAtom,
  updatePointerAtom,
  type CellCoord,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'

export interface UseSpreadsheetPointerSelectionOptions {
  /** The sheet that receives this grid surface's drag selections. */
  readonly sheetId: string
  /** Resolves the grid cell beneath a React pointer event. */
  readonly getCellCoord: (event: ReactPointerEvent<HTMLElement>) => CellCoord | null
}

export interface SpreadsheetPointerSelectionHandlers {
  onPointerCancel(event: ReactPointerEvent<HTMLElement>): void
  onPointerDown(event: ReactPointerEvent<HTMLElement>): void
  onPointerMove(event: ReactPointerEvent<HTMLElement>): void
  onPointerUp(event: ReactPointerEvent<HTMLElement>): void
}

interface ActivePointer {
  readonly id: number
  readonly target: HTMLElement
}

function releasePointerCapture(pointer: ActivePointer): void {
  try {
    pointer.target.releasePointerCapture(pointer.id)
  } catch {
    // The browser may already have released capture after a cancelled pointer stream.
  }
}

/** Binds one grid surface's primary-button drag selection to the nearest UI-core store. */
export function useSpreadsheetPointerSelection(
  options: UseSpreadsheetPointerSelectionOptions,
): SpreadsheetPointerSelectionHandlers {
  const { getCellCoord, sheetId } = options
  const { store } = useSpreadsheetUiCore()
  const activePointer = useRef<ActivePointer | null>(null)

  const cancelActivePointer = useCallback(() => {
    const pointer = activePointer.current
    if (pointer === null) return
    activePointer.current = null
    releasePointerCapture(pointer)
    store.setter(cancelPointerAtom)
  }, [store])

  useEffect(() => cancelActivePointer, [cancelActivePointer])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.isPrimary === false || event.button !== 0) return
      const coord = getCellCoord(event)
      if (coord === null) return

      event.preventDefault()
      cancelActivePointer()
      store.setter(selectCellAtom, { sheetId, coord, extend: false })
      store.setter(startPointerAtom, {
        kind: 'drag-selection',
        sheetId,
        anchor: coord,
        focus: coord,
        source: 'pointer',
      })
      activePointer.current = { id: event.pointerId, target: event.currentTarget }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Capture can fail when a browser has already settled a native stream.
      }
    },
    [cancelActivePointer, getCellCoord, sheetId, store],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = activePointer.current
      if (pointer === null || pointer.id !== event.pointerId) return
      const coord = getCellCoord(event)
      if (coord === null) return

      store.setter(selectCellAtom, { sheetId, coord, extend: true })
      store.setter(updatePointerAtom, { kind: 'drag-selection', focus: coord, source: 'pointer' })
    },
    [getCellCoord, sheetId, store],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = activePointer.current
      if (pointer === null || pointer.id !== event.pointerId) return
      activePointer.current = null
      releasePointerCapture(pointer)
      store.setter(commitPointerAtom)
    },
    [store],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = activePointer.current
      if (pointer === null || pointer.id !== event.pointerId) return
      cancelActivePointer()
    },
    [cancelActivePointer],
  )

  return { onPointerCancel, onPointerDown, onPointerMove, onPointerUp }
}
