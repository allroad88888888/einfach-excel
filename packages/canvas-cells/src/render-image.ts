import { createLayout } from './layout'
import { paintCell } from './paint-cell'
import {
  defaultTheme, type CanvasCellsInput, type CanvasCellsTheme, type LayoutCell,
} from './types'

export const MAX_IMAGE_PIXELS = 4096 * 4096

/** Reuse the cell painter without subscriptions, selection tint, event handlers or a live store. */
export function renderCellsImage(
  canvas: HTMLCanvasElement, input: CanvasCellsInput,
  options: { scale?: number; theme?: Partial<CanvasCellsTheme> } = {},
): void {
  const scale = options.scale ?? 1
  if (!Number.isFinite(scale) || scale < 1 || scale > 4)
    throw new Error('Choose an image scale from 1 to 4.')
  const rows = input.window.rowEnd - input.window.rowStart + 1
  const cols = input.window.colEnd - input.window.colStart + 1
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols)
    || rows <= 0 || cols <= 0 || rows * cols > 65_536)
    throw new Error('Choose at most 65,536 cells for image export.')
  // Check dimensions before constructing layout records or allocating the bitmap.
  const sum = (sizes: readonly number[] | undefined, count: number, fallback: number) => {
    let total = 0
    for (let i = 0; i < count; i++) {
      const size = sizes?.[i] ?? fallback
      if (!Number.isFinite(size) || size < 0) throw new Error('Invalid image cell size.')
      total += size
    }
    return total
  }
  const width = Math.ceil(sum(input.columnWidths, cols, 120) * scale)
  const height = Math.ceil(sum(input.rowHeights, rows, 28) * scale)
  if (width < 1 || height < 1) throw new Error('The selected range has no visible cells.')
  if (width > 16_384 || height > 16_384 || width * height > MAX_IMAGE_PIXELS)
    throw new Error('The image exceeds 16 megapixels. Choose a smaller range or scale.')
  const layout = createLayout(input)
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable.')
  const theme = { ...defaultTheme, ...options.theme }
  context.fillStyle = theme.background
  context.fillRect(0, 0, width, height)
  context.scale(scale, scale)
  for (const item of layout.items) paintCell(context, { item, appearance: {
    selected: false, hovered: false, edges: 0, reference: false, showFormulas: false,
  } }, theme)
  paintOuterFrame(context, layout.items, theme.gridline)
}

/**
 * 网格里首行首列的上、左格线来自表头；单独导出的图片没有表头，需补上外框才不显得缺边。
 * 画在单元格之后，避开带显式上／左边框的格，不覆盖用户设置的边框。
 */
function paintOuterFrame(
  context: CanvasRenderingContext2D, items: readonly LayoutCell[], gridline: string,
): void {
  if (gridline === 'transparent') return
  const explicit = (item: LayoutCell, side: 'top' | 'left') => item.borders.some((segment) =>
    segment.side === side && segment.border !== undefined && segment.border.style !== 'none')
  context.strokeStyle = gridline
  context.lineWidth = 1
  context.setLineDash([])
  context.beginPath()
  for (const item of items) {
    const b = item.bounds
    if (b.y === 0 && b.width > 0 && !explicit(item, 'top')) {
      context.moveTo(b.x, 0.5); context.lineTo(b.x + b.width, 0.5)
    }
    if (b.x === 0 && b.height > 0 && !explicit(item, 'left')) {
      context.moveTo(0.5, b.y); context.lineTo(0.5, b.y + b.height)
    }
  }
  context.stroke()
}
