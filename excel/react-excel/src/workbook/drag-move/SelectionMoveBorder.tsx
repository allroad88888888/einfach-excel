import { useLingui } from '@lingui/react/macro'
import { useAtomValue } from '@einfach/react'
import { dragMoveFeedbackAtom, dragMoveSessionAtom, editingSessionAtom, formatPainterAtom,
  projectedFreezeAtom, projectionSnapshotAtom, selectionRegionsAtom, selectionSnapshotAtom,
  viewportGeometrySizesAtom, viewportMetricsAtom } from '@einfach-excel/spreadsheet-ui-core'
import type { CSSProperties, RefObject } from 'react'
import {
  WORKBOOK_GRID_ROW_HEADER_WIDTH, WORKBOOK_GRID_ROW_HEIGHT,
} from '../grid/viewport/workbook-grid-config'
import { selectionEdgeGeometry } from './selection-edge-geometry'
import { useSelectionMoveDrag } from './use-selection-move-drag'
import './drag-move.css'

const EDGE = 6
type Side = 'top' | 'bottom' | 'left' | 'right'
const SIDES: readonly Side[] = ['top', 'bottom', 'left', 'right']

/** 选区外框四条可拖动的边，以及拖动时跟随指针的虚线落点；填充柄叠在其上。 */
export function SelectionMoveBorder({ scrollRef, focusGrid }: {
  scrollRef: RefObject<HTMLDivElement>; focusGrid: () => void
}) {
  const { t } = useLingui()
  const selection = useAtomValue(selectionSnapshotAtom)
  const regions = useAtomValue(selectionRegionsAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const projectedFreeze = useAtomValue(projectedFreezeAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const editing = useAtomValue(editingSessionAtom)
  const painting = useAtomValue(formatPainterAtom).mode !== 'idle'
  const feedback = useAtomValue(dragMoveFeedbackAtom)
  const session = useAtomValue(dragMoveSessionAtom)
  const handlers = useSelectionMoveDrag({ scrollRef, focusGrid })
  const freeze = projectedFreeze?.sheetId === metrics.sheetId ? projectedFreeze : null
  const enabled = ['cell', 'range'].includes(selection.selection.kind) && regions.length === 1 &&
    !editing.source && !painting && !feedback.busy && projection.status === 'ready' &&
    projection.result?.sheetId === selection.selection.sheetId
  const frame = selectionEdgeGeometry(selection.range, metrics, sizes, freeze)
  const preview = session && selectionEdgeGeometry(session.target, metrics, sizes, freeze)
  const gutter = WORKBOOK_GRID_ROW_HEADER_WIDTH
  const heading = WORKBOOK_GRID_ROW_HEIGHT
  const edgeStyle = (side: Side): CSSProperties => {
    const left = gutter + frame.left
    const top = heading + frame.top
    const horizontal = side === 'top' || side === 'bottom'
    return {
      left: horizontal ? left : left + (side === 'right' ? frame.width : 0) - EDGE / 2,
      top: horizontal ? top + (side === 'bottom' ? frame.height : 0) - EDGE / 2 : top,
      width: horizontal ? frame.width : EDGE,
      height: horizontal ? EDGE : frame.height,
      // 拖动中保持挂载，否则自动滚动把来源边裁掉时会丢失指针捕获。
      visibility: session || (enabled && frame.edges[side]) ? 'visible' : 'hidden',
    }
  }
  return <div className="drag-move-viewport"
    style={{ width: metrics.viewportWidth + gutter, height: metrics.viewportHeight + heading }}>
    {preview && preview.width > 0 && preview.height > 0 &&
      <div className="drag-move-preview" data-testid="drag-move-preview"
        data-mode={session.copy ? 'copy' : 'move'}
        style={{ left: preview.left + gutter, top: preview.top + heading,
          width: preview.width, height: preview.height }} />}
    {SIDES.map((side) => <div key={side} className="drag-move-edge" data-side={side}
      data-testid={`drag-move-edge-${side}`} aria-hidden="true"
      title={t`Drag to move cells. Hold Ctrl (Option on Mac) to copy; Escape to cancel.`}
      data-mode={session?.copy ? 'copy' : 'move'} style={edgeStyle(side)}
      onPointerDown={enabled ? handlers.onPointerDown : undefined}
      onPointerMove={handlers.onPointerMove} onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
      onLostPointerCapture={handlers.onLostPointerCapture} />)}
  </div>
}
