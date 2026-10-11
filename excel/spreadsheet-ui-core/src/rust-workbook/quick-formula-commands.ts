import type { CellCoord, CellRange } from '../shared'
import type { WorkerCommand } from '../rust-worker'
import type { NativeFunctionCatalog } from '../formula-functions/types'
import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend'

export type QuickFormula = 'sum' | 'average' | 'count'
export interface RustQuickFormulaRequest {
  readonly sheetId: string
  readonly range: CellRange
  readonly function: QuickFormula
}
export interface NativeQuickFormulaRequest extends Omit<RustQuickFormulaRequest, 'sheetId'> {
  readonly sheet: number
  readonly rowCount: number
  readonly colCount: number
}
/** 只有目标与原始公式草稿；不复制单元格数据或创建独立提交事务。 */
export interface QuickFormulaSuggestion {
  readonly target: CellCoord
  readonly input: string
}
export interface RustQuickFormulaCommands {
  readonly 'formula.recalculate': WorkerCommand<
    { readonly scope: 'sheet' | 'workbook'; readonly projection: VisibleProjectionRequest },
    { readonly formulaCount: number; readonly projection: VisibleProjectionResult }
  >
  readonly 'formula.catalog': WorkerCommand<Record<string, never>, NativeFunctionCatalog>
  readonly 'formula.suggest': WorkerCommand<
    RustQuickFormulaRequest, QuickFormulaSuggestion & { readonly revision: number }
  >
}
