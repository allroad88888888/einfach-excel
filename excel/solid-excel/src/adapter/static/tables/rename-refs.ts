// 一句话：重命名后跨整个工作簿改写结构化引用。

import type { StructuredRefRewriteSpec } from '../../static-formula-eval'
import { rewriteStructuredRefsInFormula } from '../../static-formula-eval'
import type { StaticBackendState } from '../state'

/** Rewrite `Table[...]` structured references across every sheet's formulas. */
export function rewriteTableRefsAcrossWorkbook(
  state: StaticBackendState,
  spec: StructuredRefRewriteSpec,
): void {
  for (const cells of state.cellsBySheet.values()) {
    for (const cell of cells.values()) {
      if (cell.formula === undefined) continue
      const next = rewriteStructuredRefsInFormula(cell.formula, spec)
      if (next !== cell.formula) {
        cell.formula = next
        // The projection re-derives the display at read time; keep the parked
        // placeholder in sync so a pre-projection read shows the new text.
        cell.displayValue = next
      }
    }
  }
}
