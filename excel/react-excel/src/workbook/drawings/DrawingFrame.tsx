import { useLingui } from '@lingui/react/macro'
import { useSetAtom } from '@einfach/react'
import { changeSheetDrawingAtom, dragDrawingAtom, selectDrawingAtom,
  type DrawingHandle, type SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { memo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { DrawingContribution } from '../../plugin/types'
import { gridZoomOf } from '../zoom/grid-zoom'

const HANDLES: readonly Exclude<DrawingHandle, 'move'>[] =
  ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const DRAG_THRESHOLD_PX = 3

/**
 * 一个浮动对象：框、选中、拖动缩放与删除归核心；框内内容由插件按 kind 渲染。
 * 位置是原始值并按值记忆：滚动不改变这些值时整棵对象子树不重渲染。
 */
export const DrawingFrame = memo(function DrawingFrame({ drawing, left, top, width, height,
  clipTop, clipLeft, selected, contribution, focusGrid }: {
  readonly drawing: SheetDrawing
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  /** clip-path inset：冻结区对象的滚动轴不能盖住行列标题。 */
  readonly clipTop: number
  readonly clipLeft: number
  readonly selected: boolean
  readonly contribution: DrawingContribution | undefined
  readonly focusGrid: () => void
}) {
  const { t, i18n } = useLingui()
  const drag = useSetAtom(dragDrawingAtom)
  const change = useSetAtom(changeSheetDrawingAtom)
  const select = useSetAtom(selectDrawingAtom)
  const pointer = useRef<
    { id: number; x: number; y: number; zoom: number; moved: boolean } | null>(null)
  const label = contribution ? i18n._(contribution.label) : t`Object`

  const begin = (event: PointerEvent<HTMLElement>, handle: DrawingHandle) => {
    if (event.button !== 0 || event.isPrimary === false) return
    event.preventDefault()
    event.stopPropagation()
    const frame = event.currentTarget.closest<HTMLElement>('.drawing-frame')
    frame?.focus({ preventScroll: true })
    // 越过拖动阈值才捕获指针；否则单击、双击仍派发到插件内容（如双击打开设置）。
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
      zoom: gridZoomOf(event.currentTarget), moved: false }
    void drag({ type: 'start', id: drawing.id, handle })
  }
  const move = (event: PointerEvent<HTMLElement>) => {
    const point = pointer.current
    if (point?.id !== event.pointerId) return
    event.stopPropagation()
    const dx = (event.clientX - point.x) / point.zoom
    const dy = (event.clientY - point.y) / point.zoom
    if (!point.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    if (!point.moved) event.currentTarget.setPointerCapture(event.pointerId)
    point.moved = true
    void drag({ type: 'move', dx, dy })
  }
  const end = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const point = pointer.current
    if (point?.id !== event.pointerId) return
    event.stopPropagation()
    pointer.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    void drag({ type: cancel || !point.moved ? 'cancel' : 'finish' })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      event.stopPropagation()
      void change({ type: 'remove', id: drawing.id })
      focusGrid()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      select(null)
      focusGrid()
    }
  }

  return (
    <div className="drawing-frame" role="group" tabIndex={0} aria-label={label}
      data-drawing-id={drawing.id} data-drawing-kind={drawing.kind}
      data-selected={selected || undefined}
      style={{ left, top, width, height,
        clipPath: clipTop || clipLeft ? `inset(${clipTop}px 0 0 ${clipLeft}px)` : undefined }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => begin(event, 'move')}
      onPointerMove={move}
      onPointerUp={(event) => end(event)}
      onPointerCancel={(event) => end(event, true)}
      onContextMenu={(event) => event.stopPropagation()}>
      <div className="drawing-content">
        {contribution
          ? <contribution.Renderer drawing={drawing} width={width} height={height}
            selected={selected} />
          : <div className="drawing-unsupported">{t`This object type is not available.`}</div>}
      </div>
      {selected && HANDLES.map((handle) => (
        <span key={handle} className="drawing-handle" data-handle={handle} aria-hidden="true"
          onPointerDown={(event) => begin(event, handle)}
          onPointerMove={move}
          onPointerUp={(event) => end(event)}
          onPointerCancel={(event) => end(event, true)} />
      ))}
    </div>
  )
})
