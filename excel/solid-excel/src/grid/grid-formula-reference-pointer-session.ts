import type { Store } from '@einfach/core'
import {
  exitFormulaReferenceAtom,
  formulaReferenceSessionAtom,
  pickFormulaReferenceAtom,
  type CellCoord,
} from '@einfach/spreadsheet-ui-core'

export interface FormulaReferencePointerSessionOptions {
  readonly event: PointerEvent
  readonly store: Store
  readonly sheetId: string
  readonly anchor: CellCoord
  readonly getCellCoordFromPoint: (event: PointerEvent) => CellCoord | null
  readonly restoreFocus: (caret: number) => void
}

function getPointerCaptureTarget(event: PointerEvent): HTMLElement | null {
  return event.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

function matchesPointer(pointerId: number | undefined, event: PointerEvent): boolean {
  return pointerId === undefined || event.pointerId === undefined || event.pointerId === pointerId
}

/** Owns one formula-reference pointer stream while Atom state owns the picked range. */
export function startFormulaReferencePointerSession(
  options: FormulaReferencePointerSessionOptions,
): () => void {
  const { event, store, sheetId, anchor, getCellCoordFromPoint, restoreFocus } = options
  const pointerId = event.pointerId
  const captureTarget = getPointerCaptureTarget(event)
  let lastFocus = { ...anchor }
  let settled = false
  let captured = false

  const getReferenceCaret = () => {
    const session = store.getter(formulaReferenceSessionAtom)
    return session?.tokenRange?.end ?? session?.insertionCaret ?? 0
  }

  const releaseCapture = () => {
    if (!captured || pointerId === undefined) return
    try {
      captureTarget?.releasePointerCapture?.(pointerId)
    } catch {
      // The browser may have already released capture during cancellation.
    }
  }

  const cleanup = () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('blur', onWindowBlur)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    captureTarget?.removeEventListener('lostpointercapture', onLostPointerCapture)
    releaseCapture()
  }

  const pick = (dragging: boolean) => {
    store.setter(pickFormulaReferenceAtom, {
      pickAnchor: anchor,
      pickFocus: lastFocus,
      sheetId,
      dragging,
    })
  }

  const cancel = () => {
    if (settled) return
    settled = true
    const caret = getReferenceCaret()
    cleanup()
    store.setter(exitFormulaReferenceAtom, 'cancel')
    restoreFocus(caret)
  }

  const commit = () => {
    if (settled) return
    settled = true
    pick(false)
    const caret = getReferenceCaret()
    cleanup()
    restoreFocus(caret)
  }

  const onPointerMove = (moveEvent: PointerEvent) => {
    if (!matchesPointer(pointerId, moveEvent)) return
    const focus = getCellCoordFromPoint(moveEvent)
    if (!focus || (focus.row === lastFocus.row && focus.col === lastFocus.col)) return
    lastFocus = { ...focus }
    pick(true)
  }

  const onPointerUp = (upEvent: PointerEvent) => {
    if (matchesPointer(pointerId, upEvent)) commit()
  }

  const onPointerCancel = (cancelEvent: PointerEvent) => {
    if (matchesPointer(pointerId, cancelEvent)) cancel()
  }

  const onLostPointerCapture = (lostEvent: PointerEvent) => {
    if (matchesPointer(pointerId, lostEvent)) cancel()
  }

  const onWindowBlur = () => cancel()

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') cancel()
  }

  pick(true)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('blur', onWindowBlur)
  document.addEventListener('visibilitychange', onVisibilityChange)
  captureTarget?.addEventListener('lostpointercapture', onLostPointerCapture)
  try {
    if (pointerId !== undefined && captureTarget?.setPointerCapture) {
      captureTarget.setPointerCapture(pointerId)
      captured = true
    }
  } catch {
    // Capture is optional: window listeners still finish the stream safely.
  }
  return cancel
}
