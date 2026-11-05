import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeSheetZoomAtom,
  activeWorkbookSheetAtom,
  setViewportSizeAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useLayoutEffect, type RefObject } from 'react'
import { useGridGutter, type GridGutter } from './grid-gutter'

/** Converts the scroll surface height into the unobscured cell viewport height. */
export function getWorkbookGridViewportHeight(
  clientHeight: number, { heading }: GridGutter,
): number {
  return Math.max(0, clientHeight - heading)
}

/** Excludes the sticky row-number gutter from the visible cell width. */
export function getWorkbookGridViewportWidth(clientWidth: number, { gutter }: GridGutter): number {
  return Math.max(0, clientWidth - gutter)
}

/** Keeps UI Core viewport math aligned with the browser's visible cell area. */
export function useWorkbookGridViewportMeasurement(scrollRef: RefObject<HTMLDivElement>): void {
  const setViewportSize = useSetAtom(setViewportSizeAtom)
  const sheetId = useAtomValue(activeWorkbookSheetAtom)?.id
  // 缩放改变容器内的逻辑尺寸；ResizeObserver 不一定为纯 zoom 变化触发，显式重测。
  const zoom = useAtomValue(activeSheetZoomAtom)
  const gutter = useGridGutter()

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (scroll === null) return

    const publishViewportSize = (preserveEdges = true) => {
      const viewportHeight = getWorkbookGridViewportHeight(scroll.clientHeight, gutter)
      const viewportWidth = getWorkbookGridViewportWidth(scroll.clientWidth, gutter)
      if (viewportHeight <= 0 || viewportWidth <= 0) return
      setViewportSize({ viewportHeight, viewportWidth, preserveEdges })
    }

    publishViewportSize(false)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => publishViewportSize())
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [scrollRef, setViewportSize, sheetId, zoom, gutter])
}
