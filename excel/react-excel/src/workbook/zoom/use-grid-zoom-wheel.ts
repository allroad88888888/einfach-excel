import { useSetAtom } from '@einfach/react'
import { setSheetZoomAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useEffect, type RefObject } from 'react'

const WHEEL_STEP_DELTA = 50

/** Ctrl/⌘ + 滚轮（含触控板捏合）按 10% 步进缩放网格，并拦下浏览器整页缩放。 */
export function useGridZoomWheel(scrollRef: RefObject<HTMLDivElement>): void {
  const setZoom = useSetAtom(setSheetZoomAtom)

  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll === null) return
    // 触控板捏合一次会发很多小 delta；累计到一档滚轮的量再步进。
    let pending = 0
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      pending += event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * 40
      if (Math.abs(pending) < WHEEL_STEP_DELTA) return
      setZoom({ kind: 'step', direction: pending < 0 ? 1 : -1 })
      pending = 0
    }
    // React 的 onWheel 是 passive，无法阻止整页缩放，只能原生挂载。
    scroll.addEventListener('wheel', onWheel, { passive: false })
    return () => scroll.removeEventListener('wheel', onWheel)
  }, [scrollRef, setZoom])
}
