import { renderCellsImage } from '@einfach-excel/canvas-cells'
import type { VisibleProjectionResult } from '@einfach-excel/spreadsheet-ui-core'

/** Render one immutable Rust display read; works independently of the mounted cell renderer. */
export async function renderSpreadsheetRangeAsPng(
  snapshot: VisibleProjectionResult, options: { scale?: number; gridlines?: boolean } = {},
): Promise<Blob> {
  const range = snapshot.window
  const rowCount = range.rowEnd - range.rowStart + 1
  const colCount = range.colEnd - range.colStart + 1
  if (![range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(Number.isSafeInteger)
    || range.rowStart < 0 || range.colStart < 0 || rowCount <= 0 || colCount <= 0
    || rowCount * colCount > 65_536)
    throw new Error('Choose at most 65,536 cells for image export.')
  for (const merge of snapshot.mergedRanges ?? []) {
    const intersects = merge.rowStart <= range.rowEnd && merge.rowEnd >= range.rowStart
      && merge.colStart <= range.colEnd && merge.colEnd >= range.colStart
    if (intersects && (merge.rowStart < range.rowStart || merge.rowEnd > range.rowEnd
      || merge.colStart < range.colStart || merge.colEnd > range.colEnd))
      throw new Error('Include each merged cell completely in the export range.')
  }
  const hidden = snapshot.visibility
  const hiddenRows = new Set([
    ...hidden?.manualRows ?? [], ...hidden?.filterRows ?? [], ...hidden?.outlineRows ?? [],
  ])
  const hiddenColumns = new Set([...hidden?.manualColumns ?? [], ...hidden?.outlineColumns ?? []])
  const rows = new Map(snapshot.rowHeights?.map((row) => [row.rowIndex, row.heightPx]))
  const columns = new Map(snapshot.colWidths?.map((col) => [col.colIndex, col.widthPx]))
  const rowHeights = Array.from({ length: range.rowEnd - range.rowStart + 1 }, (_, offset) => {
    const index = range.rowStart + offset
    return hiddenRows.has(index) ? 0 : rows.get(index) ?? snapshot.defaults?.rowHeight ?? 28
  })
  const columnWidths = Array.from({ length: range.colEnd - range.colStart + 1 }, (_, offset) => {
    const index = range.colStart + offset
    return hiddenColumns.has(index) ? 0 : columns.get(index) ?? snapshot.defaults?.colWidth ?? 120
  })
  const canvas = document.createElement('canvas')
  try {
    await document.fonts?.ready
    renderCellsImage(canvas, {
      window: range, cells: snapshot.cells, mergedRanges: snapshot.mergedRanges,
      mergeAnchors: snapshot.mergeAnchors, rowHeights, columnWidths, interactive: false,
    }, { scale: options.scale, theme: options.gridlines === false ? { gridline: 'transparent' } : {} })
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob?.size ? resolve(blob) : reject(new Error('Image encoding failed.')), 'image/png',
    ))
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
