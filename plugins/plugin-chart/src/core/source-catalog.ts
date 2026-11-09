import { atom, type Getter } from '@einfach/core'
import {
  activeWorkbookSheetAtom, projectionSnapshotAtom, workbookDocumentAtom, type DrawingRange,
  type SheetDrawing,
} from '@einfach-excel/spreadsheet-ui-core'
import { resolveChartSource, type SourceCatalog, type SourceResolution } from './data-source'
import { parseChartSpec } from './spec'

/** 表格与名称目录随每次可见区投影由 Rust 一并给出（整本工作簿）；这里只读，不缓存第二份。 */
export const chartSourceCatalogAtom = atom((get): SourceCatalog => {
  const result = get(projectionSnapshotAtom).result
  const visible = result?.kind === 'visible-window' ? result : null
  return {
    names: visible?.namedRanges ?? [],
    tables: visible?.tables ?? [],
    sheets: get(workbookDocumentAtom).sheets,
    ownerId: get(activeWorkbookSheetAtom)?.id ?? '',
  }
})
chartSourceCatalogAtom.debugLabel = 'plugin.chart.source.catalog'

/**
 * 图表此刻读取的区域：引用表格或名称时按当前目录解析（`refs` 只是上次解析的缓存），
 * 否则就是对象的 `refs`。
 */
export function chartAreas(get: Getter, drawing: SheetDrawing):
  SourceResolution | { readonly status: 'refs'; readonly refs: readonly (DrawingRange | null)[] } {
  const source = parseChartSpec(drawing.payload).source
  return source ? resolveChartSource(source, get(chartSourceCatalogAtom))
    : { status: 'refs', refs: drawing.refs }
}
