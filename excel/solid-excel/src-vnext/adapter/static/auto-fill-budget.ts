// 一句话：单次拖拽填充目标区的失败关闭上限。

import type { CellRange } from '@einfach/spreadsheet-ui-core'

/**
 * Fail-closed size budget for one drag-fill: one full Excel column
 * (1,048,576 rows x 1 column). Mirrors `MAX_AUTO_FILL_CELLS`
 * (`excel/rust/excel-core/src/auto_fill.rs`) and the pre-flight check in
 * `worker-workbook-backend.ts` (`prepareAutoFillWireRequest`) so every
 * backend rejects an oversized target range before doing any work.
 */
const MAX_AUTO_FILL_CELLS = 1_048_576

export function assertAutoFillWithinCellBudget(target: CellRange): void {
  const targetCells = (target.rowEnd - target.rowStart + 1) * (target.colEnd - target.colStart + 1)
  if (targetCells > MAX_AUTO_FILL_CELLS) {
    throw new Error(
      `auto-fill target spans ${targetCells} cells but the engine cap is ${MAX_AUTO_FILL_CELLS}`,
    )
  }
}
