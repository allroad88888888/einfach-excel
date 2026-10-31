import { useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { dragMoveSelectionAtom, dragMoveSessionAtom, projectedFreezeAtom,
  viewportGeometrySizesAtom, viewportMetricsAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import { useGridDragAutoscroll } from '../selection/use-grid-drag-autoscroll'
import { workbookCellAtViewportPoint } from '../grid/viewport/workbook-grid-hit-test'
import {
  WORKBOOK_GRID_ROW_HEADER_WIDTH, WORKBOOK_GRID_ROW_HEIGHT,
} from '../grid/viewport/workbook-grid-config'
import { gridZoomOf } from '../zoom/grid-zoom'
import { dragCopyModifierKey, isDragCopyModifier } from './copy-modifier'

interface Point { readonly clientX: number; readonly clientY: number }

/** 边框拖动的指针捕获、自动滚动和键盘取消；几何与提交全部交给一个 command atom。 */
export function useSelectionMoveDrag({ scrollRef, focusGrid }: {
  scrollRef: RefObject<HTMLDivElement>; focusGrid: () => void
}) {
  const { t } = useLingui()
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const projectedFreeze = useAtomValue(projectedFreezeAtom)
  const dragging = useAtomValue(dragMoveSessionAtom) !== null
  const command = useSetAtom(dragMoveSelectionAtom)
  const pointer = useRef<{ id: number; target: HTMLElement } | null>(null)
  const freeze = projectedFreeze?.sheetId === metrics.sheetId ? projectedFreeze : null

  const cellAt = ({ clientX, clientY }: Point) => {
    const scroll = scrollRef.current
    if (!scroll) return null
    const bounds = scroll.getBoundingClientRect()
    const zoom = gridZoomOf(scroll)
    return workbookCellAtViewportPoint({
      clientX: Math.max(bounds.left + WORKBOOK_GRID_ROW_HEADER_WIDTH * zoom + 1,
        Math.min(bounds.left + scroll.clientWidth * zoom - 1, clientX)),
      clientY: Math.max(bounds.top + WORKBOOK_GRID_ROW_HEIGHT * zoom + 1,
        Math.min(bounds.top + scroll.clientHeight * zoom - 1, clientY)),
      bounds, zoom, scrollTop: scroll.scrollTop, scrollLeft: scroll.scrollLeft,
      rowHeaderWidth: WORKBOOK_GRID_ROW_HEADER_WIDTH,
      rowCount: metrics.rowCount, colCount: metrics.colCount,
      rowHeight: metrics.rowHeight, colWidth: metrics.colWidth,
      rowHeights: sizes.rowHeightsBySheet[metrics.sheetId ?? ''],
      colWidths: sizes.colWidthsBySheet[metrics.sheetId ?? ''],
      frozenHeight: freeze?.height, frozenWidth: freeze?.width,
    })
  }
  const update = (point: Point) => {
    const coord = cellAt(point)
    if (coord) void command({ type: 'move', coord })
  }
  const autoscroll = useGridDragAutoscroll({
    enabled: metrics.rowCount > 0, scrollRef, onStep: update,
  })
  const stopAutoscroll = autoscroll.stop
  const release = useCallback(() => {
    stopAutoscroll()
    const active = pointer.current
    pointer.current = null
    if (active && active.target.hasPointerCapture(active.id))
      active.target.releasePointerCapture(active.id)
  }, [stopAutoscroll])

  useEffect(() => {
    if (!dragging) { release(); return }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        release()
        void command({ type: 'cancel' })
      } else if (event.key === dragCopyModifierKey()) {
        void command({ type: 'copy', copy: isDragCopyModifier(event) })
      }
    }
    const cancel = () => { release(); void command({ type: 'cancel' }) }
    window.addEventListener('keydown', key, true)
    window.addEventListener('keyup', key, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('keyup', key, true)
      window.removeEventListener('blur', cancel)
    }
  }, [dragging, command, release])
  useEffect(() => () => { void command({ type: 'cancel' }) }, [command])

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      event.stopPropagation()
      if (event.button !== 0 || event.isPrimary === false) return
      const coord = cellAt(event)
      if (!coord) return
      event.preventDefault()
      // 守卫未通过时没有会话，后续 move/finish 都是空操作；捕获只保证指针流不漏给选区拖动。
      void command({ type: 'start', coord, copy: isDragCopyModifier(event) })
      pointer.current = { id: event.pointerId, target: event.currentTarget }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (pointer.current?.id !== event.pointerId) return
      event.stopPropagation()
      update(event)
      void command({ type: 'copy', copy: isDragCopyModifier(event) })
      autoscroll.start(event)
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (pointer.current?.id !== event.pointerId) return
      event.stopPropagation()
      update(event)
      release()
      void command({
        type: 'finish', copy: isDragCopyModifier(event),
        confirmReplace: () => window.confirm(t`There's already data here. Do you want to replace it?`),
      })
      focusGrid()
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (pointer.current?.id !== event.pointerId) return
      release()
      void command({ type: 'cancel' })
    },
    onLostPointerCapture() {
      if (pointer.current === null) return
      release()
      void command({ type: 'cancel' })
    },
  }
}
