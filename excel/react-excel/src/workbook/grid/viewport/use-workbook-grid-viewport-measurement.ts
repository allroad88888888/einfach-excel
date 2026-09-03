import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  setViewportMetricsAtom,
  viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { useLayoutEffect, type RefObject } from 'react'
import {
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT,
} from './workbook-grid-config'

/** Converts the scroll surface height into the unobscured cell viewport height. */
export function getWorkbookGridViewportHeight(clientHeight: number): number {
  return Math.max(0, clientHeight - WORKBOOK_GRID_ROW_HEIGHT)
}

/** Excludes the sticky row-number gutter from the visible cell width. */
export function getWorkbookGridViewportWidth(clientWidth: number): number {
  return Math.max(0, clientWidth - WORKBOOK_GRID_ROW_HEADER_WIDTH)
}

/** Keeps UI Core viewport math aligned with the browser's visible cell area. */
export function useWorkbookGridViewportMeasurement(scrollRef: RefObject<HTMLDivElement>): void {
  const metrics = useAtomValue(viewportMetricsAtom)
  const setViewportMetrics = useSetAtom(setViewportMetricsAtom)

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (scroll === null) return

    const publishViewportSize = () => {
      const viewportHeight = getWorkbookGridViewportHeight(scroll.clientHeight)
      const viewportWidth = getWorkbookGridViewportWidth(scroll.clientWidth)
      const nextHeight = viewportHeight > 0 ? viewportHeight : metrics.viewportHeight
      const nextWidth = viewportWidth > 0 ? viewportWidth : metrics.viewportWidth
      if (nextHeight === metrics.viewportHeight && nextWidth === metrics.viewportWidth) return
      setViewportMetrics({ ...metrics, viewportHeight: nextHeight, viewportWidth: nextWidth })
    }

    publishViewportSize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(publishViewportSize)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [metrics, scrollRef, setViewportMetrics])
}
