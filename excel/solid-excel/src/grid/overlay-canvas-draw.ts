import { getSelectionRange, type CellRange, type DisplayCell } from '@einfach/spreadsheet-ui-core'
import { computeOverlayRectForRange } from './overlayGeometry'
import {
  FILL_HANDLE_SIZE,
  FORMULA_REFERENCE_PALETTE,
  OVERLAY_BORDER_WIDTH,
  OVERLAY_COLORS,
  type OverlayContext,
  type OverlayRect,
  type OverlaySnapshot,
  type OverlayViewportProvider,
} from './overlay-types'

export function drawOverlay(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snapshot: OverlaySnapshot,
): void {
  const sheetId = viewport.getSheetId()
  const cells = viewport.getCells()
  drawFreezeDividers(ctx, viewport, snapshot)
  drawConditionalFormats(ctx, viewport, cells)
  drawMergeBorders(ctx, viewport, cells)
  drawSpillBorder(ctx, viewport, snapshot, sheetId)
  drawSelections(ctx, viewport, snapshot, sheetId)
  drawActiveCell(ctx, viewport, snapshot, sheetId)
  drawFillHandle(ctx, viewport, snapshot, sheetId)
  drawFillPreview(ctx, viewport, snapshot, sheetId)
  drawClipboardSource(ctx, viewport, snapshot)
  drawFormulaReferences(ctx, viewport, snapshot, sheetId)
}

function rectForRange(viewport: OverlayViewportProvider, range: CellRange): OverlayRect | null {
  return computeOverlayRectForRange({
    range,
    getCellRect: (row, col) => viewport.getCellRect(row, col),
    getVisibleRows: viewport.getVisibleRows ? () => viewport.getVisibleRows!() : undefined,
    getVisibleCols: viewport.getVisibleCols ? () => viewport.getVisibleCols!() : undefined,
  })
}
function outline(
  ctx: OverlayContext,
  rect: OverlayRect,
  fill: string | null,
  border: string,
  width: number,
): void {
  if (fill) {
    ctx.fillStyle = fill
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  }
  ctx.strokeStyle = border
  ctx.lineWidth = width
  ctx.setLineDash([])
  ctx.strokeRect(
    rect.x + width / 2,
    rect.y + width / 2,
    Math.max(0, rect.w - width),
    Math.max(0, rect.h - width),
  )
}
function drawSelections(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snap: OverlaySnapshot,
  sheetId: string,
): void {
  const regions = snap.selectionRegions.filter((region) => region.sheetId === sheetId)
  if (!regions.length) return
  const primary = rectForRange(viewport, snap.selectionRange)
  if (primary)
    outline(
      ctx,
      primary,
      OVERLAY_COLORS.primarySelectionFill,
      OVERLAY_COLORS.primarySelectionBorder,
      OVERLAY_BORDER_WIDTH.primary,
    )
  for (let index = 1; index < regions.length; index += 1) {
    const range = getSelectionRange(regions[index], {
      rowCount: Number.MAX_SAFE_INTEGER,
      colCount: Number.MAX_SAFE_INTEGER,
    })
    const rect = rectForRange(viewport, range)
    if (rect)
      outline(
        ctx,
        rect,
        OVERLAY_COLORS.secondarySelectionFill,
        OVERLAY_COLORS.secondarySelectionBorder,
        OVERLAY_BORDER_WIDTH.secondary,
      )
  }
}
function drawActiveCell(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snap: OverlaySnapshot,
  sheetId: string,
): void {
  if (snap.activeCell.sheetId !== sheetId) return
  const rect = viewport.getCellRect(snap.activeCell.row, snap.activeCell.col)
  if (!rect) return
  outline(ctx, rect, null, OVERLAY_COLORS.activeCellBorder, OVERLAY_BORDER_WIDTH.active)
}
function drawFillHandle(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snap: OverlaySnapshot,
  sheetId: string,
): void {
  if (!snap.selectionRegions.some((region) => region.sheetId === sheetId)) return
  const rect = rectForRange(viewport, snap.selectionRange)
  if (!rect) return
  const size = FILL_HANDLE_SIZE
  const x = rect.x + rect.w - size
  const y = rect.y + rect.h - size
  ctx.fillStyle = OVERLAY_COLORS.fillHandle
  ctx.fillRect(x, y, size, size)
  ctx.strokeStyle = OVERLAY_COLORS.fillHandleStroke
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.strokeRect(x, y, size, size)
}
function drawFillPreview(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snap: OverlaySnapshot,
  sheetId: string,
): void {
  const interaction =
    snap.pointerSession.status === 'active' ? snap.pointerSession.interaction : null
  if (
    interaction?.kind !== 'fill-handle' ||
    interaction.sheetId !== sheetId ||
    !interaction.previewRange
  )
    return
  const rect = rectForRange(viewport, interaction.previewRange)
  if (!rect) return
  ctx.strokeStyle = OVERLAY_COLORS.dropIndicator
  ctx.lineWidth = OVERLAY_BORDER_WIDTH.drop
  ctx.setLineDash([4, 3])
  ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.w - 2), Math.max(0, rect.h - 2))
  ctx.setLineDash([])
}
function drawSpillBorder(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snap: OverlaySnapshot,
  sheetId: string,
): void {
  if (!snap.spillRegion || snap.spillRegion.sheetId !== sheetId) return
  const rect = rectForRange(viewport, snap.spillRegion.range)
  if (!rect) return
  ctx.strokeStyle = OVERLAY_COLORS.spillBorder
  ctx.lineWidth = OVERLAY_BORDER_WIDTH.spill
  ctx.setLineDash([])
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.w - 1), Math.max(0, rect.h - 1))
}
function drawFormulaReferences(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snap: OverlaySnapshot,
  sheetId: string,
): void {
  for (const token of snap.formulaReferenceTokens) {
    if (
      (token.sheetId ?? snap.formulaReferenceSheetId) &&
      (token.sheetId ?? snap.formulaReferenceSheetId) !== sheetId
    )
      continue
    const rect = rectForRange(viewport, token.range)
    if (!rect) continue
    ctx.strokeStyle = FORMULA_REFERENCE_PALETTE[token.colorIndex % FORMULA_REFERENCE_PALETTE.length]
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 2])
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.w - 1), Math.max(0, rect.h - 1))
    ctx.setLineDash([])
  }
}
function drawClipboardSource(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snap: OverlaySnapshot,
): void {
  const intent = snap.clipboard.intent
  if (!intent || (intent.type !== 'clipboard.copy' && intent.type !== 'clipboard.cut')) return
  const source = snap.clipboard.source ?? intent.request.source
  if (!source || source.sheetId !== viewport.getSheetId()) return
  const rect = rectForRange(viewport, source.range)
  if (!rect) return
  ctx.save()
  ctx.strokeStyle = OVERLAY_COLORS.marchingAntsBg
  ctx.lineWidth = OVERLAY_BORDER_WIDTH.marchingAnts + 1
  ctx.setLineDash([])
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  ctx.strokeStyle = OVERLAY_COLORS.marchingAnts
  ctx.lineWidth = OVERLAY_BORDER_WIDTH.marchingAnts
  ctx.setLineDash([4, 3])
  ctx.lineDashOffset = -(snap.marchingAntsOffset % 7)
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  ctx.setLineDash([])
  ctx.lineDashOffset = 0
  ctx.restore()
}
function drawMergeBorders(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  cells: readonly DisplayCell[],
): void {
  for (const cell of cells) {
    if (!cell.mergedSpan) continue
    const rect = rectForRange(viewport, {
      rowStart: cell.row,
      rowEnd: cell.row + Math.max(1, Math.trunc(cell.mergedSpan.rows)) - 1,
      colStart: cell.col,
      colEnd: cell.col + Math.max(1, Math.trunc(cell.mergedSpan.cols)) - 1,
    })
    if (!rect) continue
    ctx.strokeStyle = OVERLAY_COLORS.mergeBorder
    ctx.lineWidth = OVERLAY_BORDER_WIDTH.merge
    ctx.setLineDash([])
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.w - 1), Math.max(0, rect.h - 1))
  }
}
function drawConditionalFormats(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  cells: readonly DisplayCell[],
): void {
  for (const cell of cells) {
    if (!cell.conditionalFormat?.bgColor) continue
    const rect = viewport.getCellRect(cell.row, cell.col)
    if (!rect) continue
    ctx.fillStyle = cell.conditionalFormat.bgColor
    ctx.globalAlpha = 0.35
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    ctx.globalAlpha = 1
  }
}
function drawFreezeDividers(
  ctx: OverlayContext,
  viewport: OverlayViewportProvider,
  snap: OverlaySnapshot,
): void {
  if (snap.freezeRows <= 0 && snap.freezeCols <= 0) return
  const origin = viewport.getFreezeOrigin()
  const surface = viewport.getSurfaceSize()
  ctx.strokeStyle = OVERLAY_COLORS.freezeDivider
  ctx.lineWidth = OVERLAY_BORDER_WIDTH.freeze
  ctx.setLineDash([])
  if (snap.freezeRows > 0) {
    const rect = viewport.getCellRect(snap.freezeRows - 1, 0)
    if (rect) {
      ctx.beginPath()
      ctx.moveTo(origin.x, rect.y + rect.h)
      ctx.lineTo(surface.width, rect.y + rect.h)
      ctx.stroke()
    }
  }
  if (snap.freezeCols > 0) {
    const rect = viewport.getCellRect(0, snap.freezeCols - 1)
    if (rect) {
      ctx.beginPath()
      ctx.moveTo(rect.x + rect.w, origin.y)
      ctx.lineTo(rect.x + rect.w, surface.height)
      ctx.stroke()
    }
  }
}
