import type { CellCoord, CellRange } from '../shared'
import type { WorkerCommand } from '../rust-worker'
import type { NativeFunctionCatalog } from '../formula-functions/types'
import type {
  IterativeCalculationConfig,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../contracts'
import {
  normalizeIterativeCalculation,
  validIterativeCalculation,
  type CalculationMode,
} from '../calculation/mode-state'
import type { WasmWorkbook } from './wasm-types'
import { readVisibleProjection } from './visible-projection'

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
  readonly 'formula.setCalculationMode': WorkerCommand<
    { readonly mode: CalculationMode; readonly projection: VisibleProjectionRequest },
    {
      readonly changed: boolean
      readonly mode: CalculationMode
      readonly projection: VisibleProjectionResult
    }
  >
  readonly 'formula.setIterativeCalculation': WorkerCommand<
    IterativeCalculationConfig & { readonly projection: VisibleProjectionRequest },
    {
      readonly changed: boolean
      readonly iterativeCalculation: IterativeCalculationConfig
      readonly projection: VisibleProjectionResult
    }
  >
  readonly 'formula.catalog': WorkerCommand<Record<string, never>, NativeFunctionCatalog>
  readonly 'formula.suggest': WorkerCommand<
    RustQuickFormulaRequest, QuickFormulaSuggestion & { readonly revision: number }
  >
}

export function recalculateWorkbook(
  workbook: WasmWorkbook,
  sheetIndex: (sheetId: string) => number,
  input: RustQuickFormulaCommands['formula.recalculate']['payload'],
  revision: number,
): {
  readonly nextRevision: number
  readonly reply: RustQuickFormulaCommands['formula.recalculate']['result']
} {
  if (!['sheet', 'workbook'].includes(input.scope)) throw new Error('Invalid calculation scope.')
  const index = sheetIndex(input.projection.sheetId)
  if (!workbook.recalculate) throw new Error('Rust recalculation is unavailable.')
  const formulaCount = workbook.recalculate(input.scope === 'sheet' ? index : undefined)
  const nextRevision = formulaCount > 0 ? revision + 1 : revision
  return {
    nextRevision,
    reply: {
      formulaCount,
      projection: readVisibleProjection(workbook, index, input.projection, nextRevision),
    },
  }
}

export function setWorkbookCalculationMode(
  workbook: WasmWorkbook,
  sheetIndex: (sheetId: string) => number,
  input: RustQuickFormulaCommands['formula.setCalculationMode']['payload'],
  revision: number,
): {
  readonly nextRevision: number
  readonly reply: RustQuickFormulaCommands['formula.setCalculationMode']['result']
} {
  if (input.mode !== 'automatic' && input.mode !== 'manual')
    throw new Error('Invalid calculation mode.')
  const index = sheetIndex(input.projection.sheetId)
  if (!workbook.set_calculation_mode) throw new Error('Rust calculation mode is unavailable.')
  const changed = workbook.set_calculation_mode(input.mode)
  const nextRevision = changed ? revision + 1 : revision
  const mode = workbook.get_calculation_mode?.() ?? input.mode
  return {
    nextRevision,
    reply: {
      changed,
      mode,
      projection: readVisibleProjection(workbook, index, input.projection, nextRevision),
    },
  }
}

export function setWorkbookIterativeCalculation(
  workbook: WasmWorkbook,
  sheetIndex: (sheetId: string) => number,
  input: RustQuickFormulaCommands['formula.setIterativeCalculation']['payload'],
  revision: number,
): {
  readonly nextRevision: number
  readonly reply: RustQuickFormulaCommands['formula.setIterativeCalculation']['result']
} {
  if (typeof input?.enabled !== 'boolean')
    throw new Error('Invalid iterative calculation configuration.')
  const config = normalizeIterativeCalculation(input)
  const index = sheetIndex(input.projection.sheetId)
  if (!workbook.set_iterative_calculation)
    throw new Error('Rust iterative calculation is unavailable.')
  const changed = workbook.set_iterative_calculation(
    config.enabled,
    config.maxIterations,
    config.maxChange,
  )
  const nextRevision = changed ? revision + 1 : revision
  const raw = workbook.get_iterative_calculation?.()
  const iterativeCalculation = validIterativeCalculation(raw)
    ? normalizeIterativeCalculation(raw)
    : config
  return {
    nextRevision,
    reply: {
      changed,
      iterativeCalculation,
      projection: readVisibleProjection(workbook, index, input.projection, nextRevision),
    },
  }
}
