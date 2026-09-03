import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

const EDGE_ZONE_PX = 48
const MAX_STEP_PX = 18

export interface GridDragAutoscrollStep {
  readonly clientX: number
  readonly clientY: number
}

interface GridDragAutoscrollOptions {
  readonly enabled: boolean
  readonly scrollRef: RefObject<HTMLElement>
  readonly onStep: (point: GridDragAutoscrollStep) => void
}

interface ActiveDragPoint {
  readonly pointerId: number
  readonly clientX: number
  readonly clientY: number
}

interface AutoscrollDelta {
  readonly x: number
  readonly y: number
}

/** Calculates accelerated horizontal and vertical steps inside viewport edge zones. */
export function gridDragAutoscrollDelta(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>,
): AutoscrollDelta {
  return {
    x: axisAutoscrollDelta(clientX, bounds.left, bounds.right),
    y: axisAutoscrollDelta(clientY, bounds.top, bounds.bottom),
  }
}

function axisAutoscrollDelta(position: number, start: number, end: number): number {
  if (position < start + EDGE_ZONE_PX) {
    return -edgeSpeed(start + EDGE_ZONE_PX - position)
  }
  if (position > end - EDGE_ZONE_PX) {
    return edgeSpeed(position - (end - EDGE_ZONE_PX))
  }
  return 0
}

function edgeSpeed(distance: number): number {
  const ratio = Math.min(1, Math.max(0, distance / EDGE_ZONE_PX))
  return Math.ceil(MAX_STEP_PX * ratio * ratio)
}

/** Keeps a captured grid drag scrolling while its pointer remains near any viewport edge. */
export function useGridDragAutoscroll(options: GridDragAutoscrollOptions) {
  const activePointRef = useRef<ActiveDragPoint | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const onStepRef = useRef(options.onStep)
  onStepRef.current = options.onStep

  const stop = useCallback((pointerId?: number) => {
    const activePoint = activePointRef.current
    if (pointerId !== undefined && activePoint?.pointerId !== pointerId) return
    activePointRef.current = null
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    animationFrameRef.current = null
    const point = activePointRef.current
    const scroll = options.scrollRef.current
    if (!options.enabled || point === null || scroll === null) return

    const bounds = scroll.getBoundingClientRect()
    const delta = gridDragAutoscrollDelta(point.clientX, point.clientY, bounds)
    if (delta.x === 0 && delta.y === 0) return

    const previousLeft = scroll.scrollLeft
    const previousTop = scroll.scrollTop
    const maxLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth)
    const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
    scroll.scrollLeft = Math.max(0, Math.min(maxLeft, previousLeft + delta.x))
    scroll.scrollTop = Math.max(0, Math.min(maxTop, previousTop + delta.y))
    onStepRef.current({
      clientX: Math.max(bounds.left + 1, Math.min(bounds.right - 1, point.clientX)),
      clientY: Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, point.clientY)),
    })

    if (scroll.scrollLeft !== previousLeft || scroll.scrollTop !== previousTop) {
      animationFrameRef.current = requestAnimationFrame(tick)
    }
  }, [options.enabled, options.scrollRef])

  const schedule = useCallback(() => {
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(tick)
    }
  }, [tick])

  const start = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      activePointRef.current = pointFromEvent(event)
      schedule()
    },
    [schedule],
  )

  const track = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (activePointRef.current?.pointerId !== event.pointerId) return
      activePointRef.current = pointFromEvent(event)
      schedule()
    },
    [schedule],
  )

  useEffect(() => {
    if (!options.enabled) stop()
    return stop
  }, [options.enabled, stop])

  return { start, stop, track }
}

function pointFromEvent(event: ReactPointerEvent<HTMLElement>): ActiveDragPoint {
  return {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
  }
}
