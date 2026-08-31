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
  // 指针捕获只给触摸/笔:它治的是"触摸流被浏览器接管后 pointerup 丢失"的悬挂
  // 会话(9102d87 的初衷)。鼠标绝不能捕获 —— 捕获目标是锚点 <td>:
  // (1) pointerdown 当帧写选区触发该 <td> 重渲染,capture 随节点失效发出
  //     lostpointercapture,把会话开局即杀;
  // (2) 捕获会把 mouseup 重定向回锚点格,浏览器在锚点上派发 click,
  //     SpreadsheetGridCell 的 onClick 以 extend:false 把刚拖出的区域塌回 1×1。
  // 两条都表现为"拖拽选区只剩锚格"(e2e 契约: vnext-wave5 "pointer drag")。
  const capturable = event.pointerType !== 'mouse'
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
  if (capturable) captureTarget?.addEventListener('lostpointercapture', onLostPointerCapture)
  try {
    if (capturable && pointerId !== undefined && captureTarget?.setPointerCapture) {
      captureTarget.setPointerCapture(pointerId)
      captured = true
    }
  } catch {
    // Pointer capture can fail after a browser has ended a native touch stream.
  }
  callbacks.setCancel(cancel)
  return cancel
}
