import type { VisibleProjectionRequest, FrozenProjection } from '../backend'
import { DEFAULT_MAX_PROJECTION_CELLS } from '../projection/contracts'
import { validProjectionViewport } from '../projection/frozen-validation'
import { getFrozenRegions } from '../viewport/frozen-regions'
import type { SheetVisibilityProjection } from '../viewport/hidden-state'
import { readSizes } from './size-io'
import type { WasmWorkbook } from './wasm-types'
import { readWindowProjection } from './window-projection'

/** 只读冻结前缀的稀疏尺寸，绝不按前缀面积读取内容或展开样式。 */
export function planFrozenProjection(
  workbook: WasmWorkbook,
  sheet: number,
  request: VisibleProjectionRequest,
  freeze: { rows: number; cols: number },
  visibility?: SheetVisibilityProjection,
) {
  if (!validProjectionViewport(request.viewport)) throw new Error('Invalid projection viewport.')
  if (freeze.rows === 0 && freeze.cols === 0) return { height: 0, width: 0, regions: [] }
  const sizes = readSizes(workbook, sheet, {
    rowStart: 0,
    rowEnd: Math.max(0, freeze.rows - 1),
    colStart: 0,
    colEnd: Math.max(0, freeze.cols - 1),
  })
  return getFrozenRegions(
    request.window,
    freeze,
    request.viewport,
    Object.fromEntries(sizes.rowHeights.map(({ rowIndex, heightPx }) => [rowIndex, heightPx])),
    Object.fromEntries(sizes.colWidths.map(({ colIndex, widthPx }) => [colIndex, widthPx])),
    new Set([...(visibility?.manualRows ?? []), ...(visibility?.filterRows ?? [])]),
    new Set(visibility?.manualColumns ?? []),
    DEFAULT_MAX_PROJECTION_CELLS,
  )
}

/** 每个连续小块复用普通窗口读取；外层统一携带 sheet/request/revision。 */
export function readFrozenProjection(
  workbook: WasmWorkbook,
  sheet: number,
  request: VisibleProjectionRequest,
  freeze: { rows: number; cols: number },
  visibility?: SheetVisibilityProjection,
): FrozenProjection {
  const plan = planFrozenProjection(workbook, sheet, request, freeze, visibility)
  return {
    ...plan,
    regions: plan.regions.map((region) => {
      const { mergedRanges: _ranges, ...data } = readWindowProjection(
        workbook,
        sheet,
        region.window,
      )
      return { ...region, ...data }
    }),
  }
}
