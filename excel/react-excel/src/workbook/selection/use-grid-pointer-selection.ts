import { useSetAtom } from '@einfach/react'
import {
  cancelPointerAtom,
  commitPointerAtom,
  startPointerSelectionAtom,
  updatePointerSelectionAtom,
  type CellCoord,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export interface GridPointerSelectionOptions {
  /** The sheet that receives this grid surface's drag selections. */
  readonly sheetId: string
  /** Whether this surface currently represents cells at their true sheet position. */
  readonly enabled?: boolean
  /** Resolves the grid cell beneath a React pointer event. */
  readonly getCellCoord: (event: ReactPointerEvent<HTMLElement>) => CellCoord | null
}

export interface GridPointerSelectionHandlers {
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
export function useGridPointerSelection(
  options: GridPointerSelectionOptions,
): GridPointerSelectionHandlers {
  const { enabled = true, getCellCoord, sheetId } = options
  const cancelPointer = useSetAtom(cancelPointerAtom)
  const commitPointer = useSetAtom(commitPointerAtom)
  const startPointerSelection = useSetAtom(startPointerSelectionAtom)
  const updatePointerSelection = useSetAtom(updatePointerSelectionAtom)
  const activePointer = useRef<ActivePointer | null>(null)

  const cancelActivePointer = useCallback(() => {
    const pointer = activePointer.current
    if (pointer === null) return
    activePointer.current = null
    releasePointerCapture(pointer)
    cancelPointer()
  }, [cancelPointer])

  useEffect(() => {
    if (!enabled) cancelActivePointer()
    return cancelActivePointer
  }, [cancelActivePointer, enabled])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return
      if (event.isPrimary === false || event.button !== 0) return
      const coord = getCellCoord(event)
      if (coord === null) return

      event.preventDefault()
      cancelActivePointer()
      startPointerSelection({ sheetId, coord })
      activePointer.current = { id: event.pointerId, target: event.currentTarget }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Capture can fail when a browser has already settled a native stream.
      }
    },
    [cancelActivePointer, enabled, getCellCoord, sheetId, startPointerSelection],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) {
        cancelActivePointer()
        return
      }
      const pointer = activePointer.current
      if (pointer === null || pointer.id !== event.pointerId) return
      const coord = getCellCoord(event)
      if (coord === null) return

      updatePointerSelection({ sheetId, coord })
    },
    [cancelActivePointer, enabled, getCellCoord, sheetId, updatePointerSelection],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) {
        cancelActivePointer()
        return
      }
      const pointer = activePointer.current
      if (pointer === null || pointer.id !== event.pointerId) return
      activePointer.current = null
      releasePointerCapture(pointer)
      commitPointer()
    },
    [cancelActivePointer, commitPointer, enabled],
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
