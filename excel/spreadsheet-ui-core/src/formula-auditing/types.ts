import type { WorkerCommand } from '../rust-worker'
import type { CellRange } from '../shared'

export interface AuditingRefSnapshot {
  readonly sheetIndex: number
  readonly sheetName: string
  readonly rowStart: number
  readonly colStart: number
  readonly rowEnd: number
  readonly colEnd: number
  readonly isRange: boolean
  readonly isError: boolean
  readonly viaName?: string
}

export interface AuditingTraceArrow {
  readonly id: string
  readonly direction: 'precedents' | 'dependents'
  readonly level: number
  readonly fromSheetId: string
  readonly fromSheetName: string
  readonly fromRange: CellRange
  readonly toSheetId: string
  readonly toSheetName: string
  readonly toCell: { readonly row: number; readonly col: number }
  readonly isError: boolean
  readonly isCrossSheet: boolean
  readonly viaName?: string
}

export interface FormulaEvalStepTarget {
  readonly sheetIndex: number
  readonly sheetId?: string
  readonly sheetName: string
  readonly row: number
  readonly col: number
  readonly addr: string
}

export interface FormulaEvalStepSnapshot {
  readonly expressionBefore: string
  readonly focusStart: number
  readonly focusEnd: number
  readonly stepResult: string
  readonly expressionAfter: string
  readonly stepInTarget?: FormulaEvalStepTarget
}

export interface FormulaEvaluationTraceSnapshot {
  readonly sheetIndex: number
  readonly sheetId?: string
  readonly sheetName: string
  readonly row: number
  readonly col: number
  readonly addr: string
  readonly formula: string
  readonly finalResult: string
  readonly isError: boolean
  readonly steps: readonly FormulaEvalStepSnapshot[]
}

export interface WatchTargetSpec {
  readonly sheet?: number
  readonly sheetIndex: number
  readonly row: number
  readonly col: number
}

export interface WatchedCellSnapshot {
  readonly sheetIndex: number
  readonly sheetName: string
  readonly row: number
  readonly col: number
  readonly addr: string
  readonly name?: string
  readonly value: string
  readonly formula: string
  readonly isError: boolean
}

export interface WatchTargetEntry {
  readonly id: string
  readonly sheetId: string
  readonly sheetIndex: number
  readonly sheetName: string
  readonly row: number
  readonly col: number
  readonly addr: string
  readonly name: string
  readonly value: string
  readonly formula: string
  readonly isError: boolean
}

export interface RustFormulaAuditingTraceRequest {
  readonly direction: 'precedents' | 'dependents'
  readonly sheetId: string
  readonly row: number
  readonly col: number
}

export interface RustFormulaAuditingTraceItem extends AuditingRefSnapshot {
  readonly sheetId: string
}

export interface RustFormulaAuditingTraceResult {
  readonly sourceIsError: boolean
  readonly items: readonly RustFormulaAuditingTraceItem[]
}

export interface RustFormulaAuditingCommands {
  readonly 'formulaAuditing.trace': WorkerCommand<
    RustFormulaAuditingTraceRequest,
    RustFormulaAuditingTraceResult
  >
  readonly 'formulaAuditing.evaluate': WorkerCommand<
    { readonly sheetId: string; readonly row: number; readonly col: number },
    FormulaEvaluationTraceSnapshot
  >
  readonly 'formulaAuditing.watch': WorkerCommand<
    {
      readonly targets: readonly {
        readonly sheetId: string
        readonly row: number
        readonly col: number
      }[]
    },
    readonly (WatchedCellSnapshot & { readonly sheetId: string })[]
  >
}

export interface WasmFormulaAuditingQueries {
  trace_precedents?: (sheet: number, row: number, col: number) => readonly AuditingRefSnapshot[]
  trace_dependents?: (sheet: number, row: number, col: number) => readonly AuditingRefSnapshot[]
  evaluate_formula_steps?: (
    sheet: number,
    row: number,
    col: number,
  ) => FormulaEvaluationTraceSnapshot
  inspect_watched_cells?: (
    targets: readonly WatchTargetSpec[],
  ) => readonly WatchedCellSnapshot[]
}
