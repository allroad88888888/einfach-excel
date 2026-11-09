import { useAtomValue } from '@einfach/react'
import { drawingDragAtom, selectedDrawingAtom, viewportGeometrySizesAtom,
  viewportMetricsAtom, type SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import type { DrawingContribution } from '../../plugin/types'
import { CellDrawing } from './CellDrawing'
import { DrawingFrame } from './DrawingFrame'
import { placedDrawingRect } from './placed-rect'
import { drawingViewportBox, type DrawingFreeze } from './drawing-viewport'

/**
 * 锚点在冻结行/列内的对象：与冻结窗格同一个 sticky 视口，冻结轴不滚动，
 * 另一轴按滚动偏移换算，并裁掉标题区域。
 */
export function FrozenDrawings({ drawings, freeze, renderers, gutter, heading, focusGrid }: {
  readonly drawings: readonly SheetDrawing[]
  readonly freeze: DrawingFreeze
  readonly renderers: ReadonlyMap<string, DrawingContribution>
  readonly gutter: number
  readonly heading: number
  readonly focusGrid: () => void
}) {
  const selected = useAtomValue(selectedDrawingAtom)
  const drag = useAtomValue(drawingDragAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  if (!drawings.length) return null
  return (
    <div className="drawing-layer-viewport"
      style={{ width: metrics.viewportWidth + gutter, height: metrics.viewportHeight + heading }}>
      {drawings.map((drawing) => {
        const contribution = renderers.get(drawing.kind)
        const rect = drag?.id === drawing.id
          ? drag.current : placedDrawingRect(drawing, contribution, metrics, sizes)
        if (!rect) return null
        const box = drawingViewportBox(rect, drawing.anchor, metrics, freeze, gutter, heading)
        if (contribution?.placement === 'cell')
          return box.visible ? <CellDrawing key={drawing.id} drawing={drawing} left={box.left}
            top={box.top} width={box.width} height={box.height} clipTop={box.clipTop}
            clipLeft={box.clipLeft} contribution={contribution} /> : null
        return <DrawingFrame key={drawing.id} drawing={drawing} left={box.left} top={box.top}
          width={box.width} height={box.height} clipTop={box.clipTop} clipLeft={box.clipLeft}
          selected={selected?.id === drawing.id} contribution={contribution}
          focusGrid={focusGrid} />
      })}
    </div>
  )
}
