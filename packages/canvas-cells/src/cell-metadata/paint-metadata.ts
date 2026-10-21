import type { Rect } from '@einfach/canvas'
import type { DisplayCell } from '@einfach/spreadsheet-ui-core'

/** 绘制原生备注、线程及条件图标；不计算规则或读取工作簿。 */
export function paintCellMetadata(
  ctx: CanvasRenderingContext2D, bounds: Rect, cell: DisplayCell | undefined,
): void {
  if (!cell) return
  const { x, y, width, height } = bounds
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip()
  const icon = cell.conditionalIcon
  if (icon) {
    ctx.fillStyle = ['#c93639', '#b57900', '#21834a'][icon.index]
    ctx.font = '700 14px Arial, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(icon.set === 'three-arrows' ? ['↓', '→', '↑'][icon.index]
      : icon.set === 'three-traffic-lights' ? '●' : '⚑', x + 10, y + height / 2)
  }
  if (cell.noteIndicator) {
    ctx.fillStyle = '#c93639'
    ctx.beginPath(); ctx.moveTo(x + width - 7, y + 1)
    ctx.lineTo(x + width - 1, y + 1); ctx.lineTo(x + width - 1, y + 7)
    ctx.closePath(); ctx.fill()
  }
  if (cell.commentIndicator || cell.commentThreadId) {
    ctx.fillStyle = '#6b4fbb'
    ctx.beginPath()
    ctx.arc(x + width - (cell.noteIndicator ? 11 : 4), y + 4, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
