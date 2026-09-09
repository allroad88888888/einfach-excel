import { useAtomValue, useSetAtom } from '@einfach/react'
import { directionalFillFeedbackAtom, dragFillHandleAtom, editingSessionAtom, fillHandleDragAtom,
  projectedFreezeAtom, projectionSnapshotAtom, selectionSnapshotAtom, selectionRegionsAtom,
  viewportGeometrySizesAtom, viewportMetricsAtom } from '@einfach/spreadsheet-ui-core'
import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import { useGridDragAutoscroll } from '../../selection/use-grid-drag-autoscroll'
import { workbookCellAtViewportPoint } from '../viewport/workbook-grid-hit-test'
import { WORKBOOK_GRID_ROW_HEADER_WIDTH, WORKBOOK_GRID_ROW_HEIGHT } from '../viewport/workbook-grid-config'
import { fillHandleGeometry } from './fill-handle-geometry'
import './fill-handle.css'

/** 一个填充柄覆盖所有冻结分区；指针捕获与滚动归 DOM，预览与提交归 command。 */
export function FillHandle({ scrollRef, focusGrid }: {
  scrollRef: RefObject<HTMLDivElement>; focusGrid: () => void
}) {
  const selection = useAtomValue(selectionSnapshotAtom)
  const regions = useAtomValue(selectionRegionsAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const projectedFreeze = useAtomValue(projectedFreezeAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const editing = useAtomValue(editingSessionAtom)
  const feedback = useAtomValue(directionalFillFeedbackAtom)
  const drag = useAtomValue(fillHandleDragAtom)
  const dragging = drag !== null
  const command = useSetAtom(dragFillHandleAtom)
  const button = useRef<HTMLButtonElement>(null)
  const pointer = useRef<number | null>(null)
  const freeze = projectedFreeze?.sheetId === metrics.sheetId ? projectedFreeze : null
  const enabled = ['cell', 'range'].includes(selection.selection.kind) && regions.length === 1 &&
    !editing.source && !feedback.busy && projection.status === 'ready' &&
    projection.result?.sheetId === selection.selection.sheetId
  const update = ({ clientX, clientY }: { clientX: number; clientY: number }) => {
    const scroll = scrollRef.current
    if (!scroll) return
    const bounds = scroll.getBoundingClientRect()
    const coord = workbookCellAtViewportPoint({
      clientX: Math.max(bounds.left + WORKBOOK_GRID_ROW_HEADER_WIDTH + 1,
        Math.min(bounds.left + scroll.clientWidth - 1, clientX)),
      clientY: Math.max(bounds.top + WORKBOOK_GRID_ROW_HEIGHT + 1,
        Math.min(bounds.top + scroll.clientHeight - 1, clientY)),
      bounds, scrollTop: scroll.scrollTop, scrollLeft: scroll.scrollLeft,
      rowHeaderWidth: WORKBOOK_GRID_ROW_HEADER_WIDTH,
      rowCount: metrics.rowCount, colCount: metrics.colCount,
      rowHeight: metrics.rowHeight, colWidth: metrics.colWidth,
      rowHeights: sizes.rowHeightsBySheet[metrics.sheetId ?? ''],
      colWidths: sizes.colWidthsBySheet[metrics.sheetId ?? ''],
      frozenHeight: freeze?.height, frozenWidth: freeze?.width,
    })
    if (coord) void command({ type: 'move', coord })
  }
  // start() 与 React 更新在同一个指针事件内；不能切 enabled，否则 hook 的清理会丢掉捕获点。
  const autoscroll = useGridDragAutoscroll({
    enabled: metrics.rowCount > 0, scrollRef, onStep: update,
  })
  const stopAutoscroll = autoscroll.stop
  const stop = useCallback(() => {
    stopAutoscroll()
    const id = pointer.current
    pointer.current = null
    if (id !== null && button.current?.hasPointerCapture(id))
      button.current.releasePointerCapture(id)
  }, [stopAutoscroll])
  useEffect(() => {
    if (!dragging) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        void command({ type: 'cancel' })
      } else if (event.key === 'Control' || event.key === 'Meta') {
        void command({ type: 'copy', copy: event.ctrlKey || event.metaKey })
      }
    }
    const cancel = () => { void command({ type: 'cancel' }) }
    window.addEventListener('keydown', key, true)
    window.addEventListener('keyup', key, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('keyup', key, true)
      window.removeEventListener('blur', cancel)
    }
  }, [dragging, command])
  useEffect(() => {
    if (!dragging) { stop(); void command({ type: 'cancel' }) }
  }, [dragging, stop, command])
  useEffect(() => () => { void command({ type: 'cancel' }) }, [command])

  const corner = fillHandleGeometry(selection.range, metrics, sizes, freeze)
  const preview = drag && fillHandleGeometry(drag.range, metrics, sizes, freeze)
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    event.stopPropagation()
    if (pointer.current !== event.pointerId) return
    if (!cancel && drag?.direction) update(event)
    stop()
    void command(cancel ? { type: 'cancel' } : { type: 'finish', copy: event.ctrlKey || event.metaKey })
    focusGrid()
  }
  const gutter = WORKBOOK_GRID_ROW_HEADER_WIDTH
  const heading = WORKBOOK_GRID_ROW_HEIGHT
  return <div className="fill-handle-viewport"
    style={{ width: metrics.viewportWidth + gutter, height: metrics.viewportHeight + heading }}>
    {preview && drag?.direction && <div className="fill-handle-preview" data-testid="fill-preview"
      style={{ left: preview.left + gutter, top: preview.top + heading,
        width: preview.width, height: preview.height }} />}
    <button ref={button} type="button" aria-label="Drag to fill" tabIndex={-1}
      disabled={!enabled && !drag}
      title="Drag to fill. Hold Ctrl/⌘ to copy; Escape to cancel."
      className="fill-handle" data-mode={drag?.copy ? 'copy' : 'auto'}
      style={{ left: gutter + corner.cornerX - 6, top: heading + corner.cornerY - 6,
        visibility: (enabled || drag) && corner.cornerVisible ? 'visible' : 'hidden' }}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (!enabled || event.button !== 0 || event.isPrimary === false) return
        event.preventDefault()
        pointer.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        void command({ type: 'start', copy: event.ctrlKey || event.metaKey })
        autoscroll.start(event)
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        if (pointer.current !== event.pointerId) return
        update(event)
        void command({ type: 'copy', copy: event.ctrlKey || event.metaKey })
        autoscroll.track(event)
      }}
      onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={() => {
        if (pointer.current !== null) { stop(); void command({ type: 'cancel' }) }
      }} />
  </div>
}
