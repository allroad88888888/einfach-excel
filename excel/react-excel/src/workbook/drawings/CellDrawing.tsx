import { memo } from 'react'
import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import type { DrawingContribution } from '../../plugin/types'

/**
 * 格内对象（如迷你图）：铺满所在单元格，像单元格内容一样不可选中、拖动，
 * 指针事件穿透到网格；编辑与删除由插件按单元格选区提供。
 */
export const CellDrawing = memo(function CellDrawing({ drawing, left, top, width, height,
  clipTop, clipLeft, contribution }: {
  readonly drawing: SheetDrawing
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly clipTop: number
  readonly clipLeft: number
  readonly contribution: DrawingContribution
}) {
  return (
    <div className="drawing-cell" aria-hidden="true" data-drawing-id={drawing.id}
      data-drawing-kind={drawing.kind}
      style={{ left, top, width, height,
        clipPath: clipTop || clipLeft ? `inset(${clipTop}px 0 0 ${clipLeft}px)` : undefined }}>
      <contribution.Renderer drawing={drawing} width={width} height={height} selected={false} />
    </div>
  )
})
