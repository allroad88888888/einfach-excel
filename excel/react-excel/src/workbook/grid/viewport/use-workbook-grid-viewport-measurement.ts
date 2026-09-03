import { useSetAtom } from '@einfach/react'
import { setViewportSizeAtom } from '@einfach/spreadsheet-ui-core'
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
  const setViewportSize = useSetAtom(setViewportSizeAtom)

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (scroll === null) return

    const publishViewportSize = () => {
      const viewportHeight = getWorkbookGridViewportHeight(scroll.clientHeight)
      const viewportWidth = getWorkbookGridViewportWidth(scroll.clientWidth)
      if (viewportHeight <= 0 || viewportWidth <= 0) return
      setViewportSize({ viewportHeight, viewportWidth })
    }

    publishViewportSize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(publishViewportSize)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [scrollRef, setViewportSize])
}
