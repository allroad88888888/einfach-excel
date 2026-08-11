/**
 * Owns the DOM lifetime of one grid drag-selection pointer stream.
 *
 * Selection state remains in UI-core atoms. This helper only ensures a native
 * pointer stream is settled by its initiating pointer or a terminal browser
 * lifecycle event before the grid can receive another interaction.
 */
export interface GridDragSelectionPointerSessionCallbacks {
  readonly move: (event: PointerEvent) => void
  readonly commit: () => void
  readonly cancel: () => void
  readonly setCancel: (cancel: () => void) => void
}

function getPointerCaptureTarget(event: PointerEvent): HTMLElement | null {
  const target = event.currentTarget
  return target instanceof HTMLElement ? target : null
}

function matchesPointer(pointerId: number | undefined, event: PointerEvent): boolean {
  return pointerId === undefined || event.pointerId === undefined || event.pointerId === pointerId
}

/** Attaches the DOM listeners for a grid drag-selection session. */
export function startGridDragSelectionPointerSession(
  event: PointerEvent,
  callbacks: GridDragSelectionPointerSessionCallbacks,
): () => void {
  const pointerId = event.pointerId
  const captureTarget = getPointerCaptureTarget(event)
  let settled = false
  let captured = false

  const releaseCapture = () => {
    if (!captured || pointerId === undefined) return
    try {
      captureTarget?.releasePointerCapture?.(pointerId)
    } catch {
      // A cancelled pointer can already have released its browser capture.
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
    callbacks.setCancel(() => undefined)
  }

  const cancel = () => {
    if (settled) return
    settled = true
    cleanup()
    callbacks.cancel()
  }

  const onPointerMove = (moveEvent: PointerEvent) => {
    if (matchesPointer(pointerId, moveEvent)) callbacks.move(moveEvent)
  }

  const onPointerUp = (upEvent: PointerEvent) => {
    if (!matchesPointer(pointerId, upEvent) || settled) return
    settled = true
    cleanup()
    callbacks.commit()
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
    // Pointer capture can fail after a browser has ended a native touch stream.
  }
  callbacks.setCancel(cancel)
  return cancel
}
