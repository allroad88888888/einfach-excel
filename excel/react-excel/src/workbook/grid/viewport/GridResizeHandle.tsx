import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  editingSessionAtom,
  getViewportColumnWidth,
  getViewportRowHeight,
  projectionSnapshotAtom,
  resizeDragAtom,
  runResizeDragAtom,
  selectionSizePanelAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { useEffect, useRef } from 'react'
import './grid-resize.css'

/** 手柄只处理 DOM 捕获与键盘；尺寸草稿及落库由公共 command atom 负责。 */
export function GridResizeHandle({
  axis,
  index,
  label,
  focusGrid,
}: {
  axis: 'row' | 'column'
  index: number
  label: string
  focusGrid: () => void
}) {
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const drag = useAtomValue(resizeDragAtom)
  const run = useSetAtom(runResizeDragAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const panel = useAtomValue(selectionSizePanelAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const ref = useRef<HTMLSpanElement>(null)
  const active = drag?.sheetId === sheet?.id && drag?.axis === axis && drag.index === index
  const pointerId = active ? drag?.pointerId : undefined
  const disabled = editing || panel.busy || Boolean(panel.target) || projection.status !== 'ready'
  const pixels = active
    ? drag!.pixels
    : axis === 'row'
      ? getViewportRowHeight(sizes, sheet?.id ?? '', index, metrics.rowHeight)
      : getViewportColumnWidth(sizes, sheet?.id ?? '', index, metrics.colWidth)
  useEffect(() => {
    if (pointerId === undefined) return
    const cancel = () => {
      void run({ phase: 'cancel', pointerId })
      if (ref.current?.hasPointerCapture(pointerId)) ref.current.releasePointerCapture(pointerId)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cancel()
      focusGrid()
    }
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', cancel)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', cancel)
      void run({ phase: 'cancel', pointerId })
    }
  }, [pointerId, run, focusGrid])
  return (
    <span
      ref={ref}
      className={`grid-resize-handle grid-resize-${axis}`}
      role="separator"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Resize ${axis} ${label}`}
      aria-orientation={axis === 'row' ? 'horizontal' : 'vertical'}
      aria-valuemin={axis === 'row' ? 16 : 40}
      aria-valuemax={axis === 'row' ? 512 : 1024}
      aria-valuenow={pixels}
      aria-disabled={disabled}
      title={`Drag to resize ${axis}; arrow keys adjust by 10 px`}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (disabled || event.button !== 0 || event.isPrimary === false) return
        const started = run({
          phase: 'start',
          axis,
          index,
          pointerId: event.pointerId,
          position: axis === 'row' ? event.clientY : event.clientX,
        })
        if (started === true) {
          event.currentTarget.focus({ preventScroll: true })
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }}
      onPointerMove={(event) => {
        event.stopPropagation()
        void run({
          phase: 'move',
          pointerId: event.pointerId,
          position: axis === 'row' ? event.clientY : event.clientX,
        })
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        void run({ phase: 'commit', pointerId: event.pointerId })
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={(event) => {
        void run({ phase: 'cancel', pointerId: event.pointerId })
      }}
      onLostPointerCapture={(event) => {
        void run({ phase: 'cancel', pointerId: event.pointerId })
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const keys = axis === 'row' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
        const direction = keys.indexOf(event.key)
        if (direction < 0 || disabled) return
        event.preventDefault()
        event.stopPropagation()
        if (run({ phase: 'start', axis, index, pointerId: -1, position: 0 }) !== true) return
        void run({ phase: 'move', pointerId: -1, position: direction === 0 ? -10 : 10 })
        void run({ phase: 'commit', pointerId: -1 })
      }}
    />
  )
}
