import type {
  RangeImageExportRequest,
  RangeImageExportResult,
  SpreadsheetBackend,
  ViewportColumnWidth,
  ViewportRowHeight,
} from '@einfach/spreadsheet-ui-core'

import { renderRangeAsImage } from './renderRangeAsImage'

function projectViewportSizes(
  rows: ReadonlyArray<ViewportRowHeight>,
  cols: ReadonlyArray<ViewportColumnWidth>,
): {
  columnWidths: Map<number, number>
  rowHeights: Map<number, number>
  medianColWidthPx?: number
  medianRowHeightPx?: number
} {
  const median = (values: number[]): number | undefined => {
    if (values.length === 0) return undefined
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.floor(sorted.length / 2)]
  }
  const columnWidths = new Map<number, number>()
  for (const column of cols) {
    if (column.widthPx > 0) columnWidths.set(column.colIndex, column.widthPx)
  }
  const rowHeights = new Map<number, number>()
  for (const row of rows) {
    if (row.heightPx > 0) rowHeights.set(row.rowIndex, row.heightPx)
  }
  return {
    columnWidths,
    rowHeights,
    medianColWidthPx: median(cols.map((column) => column.widthPx).filter((width) => width > 0)),
    medianRowHeightPx: median(rows.map((row) => row.heightPx).filter((height) => height > 0)),
  }
}

/** Read representative dimensions for the image pixel-cap preflight. */
export async function readCopyAsImageSizeEstimate(
  backend: SpreadsheetBackend,
  sheetId: string,
  range: RangeImageExportRequest['range'],
): Promise<{ estimatedColWidthPx?: number; estimatedRowHeightPx?: number }> {
  if (!backend.readViewportSizeProjection) return {}
  try {
    const size = await backend.readViewportSizeProjection({
      kind: 'viewport-size',
      sheetId,
      window: range,
    })
    const projection = projectViewportSizes(size.rowHeights, size.colWidths)
    return {
      estimatedColWidthPx: projection.medianColWidthPx,
      estimatedRowHeightPx: projection.medianRowHeightPx,
    }
  } catch {
    return {}
  }
}

/**
 * Add the DOM-host renderer only when the backend lacks a native image port.
 * This adapter is per-dispatch, so it never mutates the long-lived backend.
 */
export function withCopyAsHostImageRenderer(backend: SpreadsheetBackend): SpreadsheetBackend {
  if (backend.exportRangeAsImage) return backend
  return {
    ...backend,
    async exportRangeAsImage(request: RangeImageExportRequest): Promise<RangeImageExportResult> {
      const projection = await backend.readRangeProjection({
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId ?? 0,
        revision: request.revision,
        reason: 'clipboard',
        range: request.range,
      })
      const estimate = await readCopyAsImageSizeEstimate(backend, request.sheetId, request.range)
      let columnWidths: ReadonlyMap<number, number> | undefined
      let rowHeights: ReadonlyMap<number, number> | undefined
      if (backend.readViewportSizeProjection) {
        try {
          const size = await backend.readViewportSizeProjection({
            kind: 'viewport-size',
            sheetId: request.sheetId,
            window: request.range,
            requestId: request.requestId,
            revision: request.revision,
          })
          const projectionSizes = projectViewportSizes(size.rowHeights, size.colWidths)
          columnWidths = projectionSizes.columnWidths
          rowHeights = projectionSizes.rowHeights
        } catch {
          // Geometry is visual decoration. Rendering can use its defaults.
        }
      }
      return renderRangeAsImage({
        sheetId: request.sheetId,
        range: request.range,
        cells: projection.cells,
        scale: request.scale,
        columnWidths,
        rowHeights,
        colWidthPx: estimate.estimatedColWidthPx,
        rowHeightPx: estimate.estimatedRowHeightPx,
        hiddenRows: request.hiddenRows,
      })
    },
  }
}
