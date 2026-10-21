import type { ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult } from '../../backend'
import type { WorkerCommand } from '../../rust-worker/types'
import type { RustWorkbookSheet } from '../commands'
import type { WasmWorkbook } from '../wasm-types'
import { validateProjectionRequest } from '../../projection/contracts'
import { validateCustomFormulaDefinitions, type NativeCustomFormulaAction,
  type NativeCustomFormulaDefinition } from '../../custom-formulas/expression-types'

export interface WasmCustomFormulaQueries {
  read_custom_formulas?: () => string
  change_custom_formula?: (sheet: number, action: string) => boolean
}
export interface RustCustomFormulaCommands {
  'customFormula.read': WorkerCommand<{ readonly revision: ProjectionRevision }, {
    readonly definitions: readonly NativeCustomFormulaDefinition[]
    readonly revision: ProjectionRevision
  }>
  'customFormula.change': WorkerCommand<{
    readonly sheetId: string
    readonly revision: ProjectionRevision
    readonly action: NativeCustomFormulaAction
    readonly projection: VisibleProjectionRequest
  }, { readonly changed: boolean; readonly definitions: readonly NativeCustomFormulaDefinition[]
    readonly projection: VisibleProjectionResult }>
}

export function readCustomFormulas(
  workbook: WasmWorkbook,
  input: { revision: ProjectionRevision },
  revision: number,
) {
  if (input.revision !== revision)
    throw new Error('The workbook changed. Reopen the custom formula editor.')
  if (!workbook.read_custom_formulas) throw new Error('Rust custom formula editing is unavailable.')
  return validateCustomFormulaDefinitions(JSON.parse(workbook.read_custom_formulas()))
}

export function changeCustomFormula(
  workbook: WasmWorkbook,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustCustomFormulaCommands['customFormula.change']['payload'],
  revision: number,
): boolean {
  if (input.revision !== revision)
    throw new Error('The workbook changed. Reopen the custom formula editor.')
  const sheet = sheets.get(input.sheetId)
  if (!sheet) throw new Error('The worksheet no longer exists.')
  if (input.sheetId !== input.projection.sheetId || !validateProjectionRequest(input.projection).ok)
    throw new Error('Invalid custom formula projection request.')
  if (!input.action || !['upsert', 'remove'].includes(input.action.kind))
    throw new Error('Invalid custom formula action.')
  if (!workbook.change_custom_formula)
    throw new Error('Rust custom formula editing is unavailable.')
  return workbook.change_custom_formula(sheet.index, JSON.stringify(input.action))
}
