import type { VisibleProjectionResult } from '../backend'
import type { CellRange } from '../shared'
import { displayCell } from './cell-io'
import { applyVisibleFormats } from './format-projection'
import { readMergeProjection } from './merge-projection'
import { readSizes } from './size-io'
import type { WasmWorkbook } from './wasm-types'

/** 读取一个连续可见矩形；滚动区与冻结区复用同一套值、格式与合并锚点规则。 */
export function readWindowProjection(
  workbook: WasmWorkbook,
  sheet: number,
  window: CellRange,
): Pick<
  VisibleProjectionResult,
  'cells' | 'mergedRanges' | 'mergeAnchors' | 'rowHeights' | 'colWidths'
> {
  if (!workbook.read_sparse_range || !workbook.snapshot_format_range)
    throw Object.assign(new Error('Rust window projection is unavailable'), {
      code: 'WASM_METHOD_UNAVAILABLE',
    })
  const { rowStart, colStart, rowEnd, colEnd } = window
  const cells = workbook
    .read_sparse_range(sheet, rowStart, colStart, rowEnd, colEnd)
    .map(displayCell)
    .filter((cell): cell is NonNullable<typeof cell> => cell !== null)
  const formats = workbook.snapshot_format_range(sheet, rowStart, colStart, rowEnd, colEnd)
  return {
    cells: applyVisibleFormats(cells, window, formats),
    ...readMergeProjection(workbook, sheet, window),
    rowHeights: formats.rowStyles.flatMap(({ index, height }) =>
      height === undefined ? [] : [{ rowIndex: index, heightPx: height }],
    ),
    // 旧测试假件可省略尺寸 API；生产 WASM 提供完整的行列尺寸快照。
    ...(workbook.snapshot_viewport_sizes ? readSizes(workbook, sheet, window) : {}),
  }
}
