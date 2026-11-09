import { useAtomValue } from '@einfach/react'
import { drawingDragAtom, selectedDrawingAtom, viewportGeometrySizesAtom,
  viewportMetricsAtom, type SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import type { DrawingContribution } from '../../plugin/types'
import { CellDrawing } from './CellDrawing'
import { DrawingFrame } from './DrawingFrame'
import { placedDrawingRect } from './placed-rect'

/**
 * 滚动区对象放进滚动内容本身，按内容坐标定位：滚动由浏览器原生合成，
 * 位置不随 scroll 事件重算，图表与单元格逐帧同步。冻结窗格与行列标题叠在上面。
 */
export function ScrollingDrawings({ drawings, renderers, gutter, heading, focusGrid }: {
  readonly drawings: readonly SheetDrawing[]
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
    <div className="drawing-layer-content" data-testid="drawing-layer">
      {drawings.map((drawing) => {
        const contribution = renderers.get(drawing.kind)
        const rect = drag?.id === drawing.id
          ? drag.current : placedDrawingRect(drawing, contribution, metrics, sizes)
        if (!rect) return null
        if (contribution?.placement === 'cell')
          return <CellDrawing key={drawing.id} drawing={drawing} left={gutter + rect.left}
            top={heading + rect.top} width={rect.width} height={rect.height} clipTop={0}
            clipLeft={0} contribution={contribution} />
        // 位置只依赖锚点与行列尺寸，滚动时这些值不变，帧组件按值记忆不重渲染。
        return <DrawingFrame key={drawing.id} drawing={drawing}
          left={gutter + rect.left} top={heading + rect.top} width={rect.width}
          height={rect.height} clipTop={0} clipLeft={0} selected={selected?.id === drawing.id}
          contribution={contribution} focusGrid={focusGrid} />
      })}
    </div>
  )
}
