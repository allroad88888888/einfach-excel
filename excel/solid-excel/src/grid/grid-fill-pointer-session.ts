/**
 * Owns the DOM lifetime of one fill-handle pointer stream.
 *
 * The selection preview and commit intent remain in UI-core atoms. This
 * adapter only prevents a browser pointer stream from outliving its mounted
 * grid or being completed by a different pointer.
 */
export interface FillPointerSessionCallbacks {
  readonly move: (event: PointerEvent) => void
  readonly commit: (event: PointerEvent) => void
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

/**
 * Attach listeners for one fill-handle pointer drag and return its canceler.
 *
 * The caller is responsible for starting the atom session before this helper
 * is called. Every terminal DOM path invokes `cancel` or `commit` exactly
 * once, then unregisters every listener.
 */
export function startFillPointerSession(
  event: PointerEvent,
  callbacks: FillPointerSessionCallbacks,
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
    if (!matchesPointer(pointerId, moveEvent)) return
    callbacks.move(moveEvent)
  }

  const onPointerUp = (upEvent: PointerEvent) => {
    if (!matchesPointer(pointerId, upEvent) || settled) return
    settled = true
    cleanup()
    callbacks.commit(upEvent)
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
    // Capturing can fail when the browser ends a native pointer stream early.
  }
  callbacks.setCancel(cancel)
  return cancel
}
