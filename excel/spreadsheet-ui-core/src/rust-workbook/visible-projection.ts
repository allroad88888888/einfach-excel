import type {
  ProjectionRevision,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../backend'
import type { WasmWorkbook } from './wasm-types'
import { readWindowProjection } from './window-projection'
import { readFrozenProjection } from './frozen-projection'
import { validateCustomFormulaDefinitions } from '../custom-formulas/expression-types'
import type { NativeCustomFormulaDefinition } from '../custom-formulas/expression-types'

// 仅缓存同一原生实例/既有revision的只读目录投影；不是第二个可写registry。
const customDirectories = new WeakMap<WasmWorkbook, {
  revision: ProjectionRevision; definitions: readonly NativeCustomFormulaDefinition[]
}>()

function customDirectory(workbook: WasmWorkbook, revision: ProjectionRevision) {
  if (!workbook.read_custom_formulas) return undefined
  const saved = customDirectories.get(workbook)
  if (saved?.revision === revision) return saved.definitions
  const definitions = validateCustomFormulaDefinitions(JSON.parse(workbook.read_custom_formulas()))
  customDirectories.set(workbook, { revision, definitions })
  return definitions
}

/** 一个同步读取过程组合滚动区与冻结区，不增加 Worker 往返或第二个数据版本。 */
export function readVisibleProjection(
  workbook: WasmWorkbook,
  sheetIndex: number,
  request: VisibleProjectionRequest,
  revision: ProjectionRevision,
): VisibleProjectionResult {
  const counts = workbook.frozen_panes?.(sheetIndex)
  const freeze = counts ? { rows: counts[0], cols: counts[1] } : undefined
  const visibility = workbook.sheet_visibility?.(sheetIndex)
  const frozen = freeze && request.viewport
    ? readFrozenProjection(workbook, sheetIndex, request, freeze, visibility)
    : undefined
  const customFormulaDefinitions = customDirectory(workbook, revision)
  return {
    kind: 'visible-window',
    ...(workbook.listTables ? { tables: workbook.listTables() } : {}),
    ...(freeze ? { freeze } : {}),
    ...(frozen ? { frozen } : {}),
    ...(visibility ? { visibility } : {}),
    ...(visibility?.filterRules ? { filterRules: visibility.filterRules } : {}),
    ...(visibility?.filterRange ? { filterRange: visibility.filterRange } : {}),
    ...(workbook.history_state ? { history: workbook.history_state() } : {}),
    ...(workbook.read_protection ? { protection: workbook.read_protection(sheetIndex) } : {}),
    ...(customFormulaDefinitions ? { customFormulaDefinitions } : {}),
    ...(workbook.list_named_ranges ? { namedRanges: workbook.list_named_ranges() } : {}),
    ...(workbook.listConditionalFormats
      ? { conditionalFormats: workbook.listConditionalFormats(sheetIndex) } : {}),
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision,
    window: { ...request.window },
    ...readWindowProjection(workbook, sheetIndex, request.window, visibility),
  }
}
