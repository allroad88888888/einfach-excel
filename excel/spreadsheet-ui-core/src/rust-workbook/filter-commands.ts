import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
import type { WorkerCommand } from '../rust-worker'
import type { ColumnFilterRule } from '../filter-sort/types'

export type RustFilterAction =
  | { readonly action: 'apply'; readonly rules: readonly ColumnFilterRule[] }
  | { readonly action: 'reapply' | 'clear' }
export type RustFilterReport =
  | {
      readonly ok: true
      readonly hiddenRows: readonly number[]
      readonly scannedRows: number
      readonly predicateCells: number
    }
  | { readonly ok: false; readonly code: string; readonly message?: string }
export interface RustFilterCommands {
  readonly 'sheet.filter': WorkerCommand<
    RustFilterAction & {
      readonly sheetId: string
      readonly projection: VisibleProjectionRequest
    },
    { readonly hiddenRows: number; readonly projection: VisibleProjectionResult }
  >
}

/** 传输边界校验；只检查条件形状，不在 JS 判断任何单元格是否匹配。 */
export function validFilterRules(
  value: unknown,
  columns = 16_384,
): value is readonly ColumnFilterRule[] {
  if (!Array.isArray(value) || value.length > 8) return false
  return (
    value.every((rule: ColumnFilterRule) => {
      if (
        !rule ||
        !Number.isSafeInteger(rule.colIndex) ||
        rule.colIndex < 0 ||
        rule.colIndex >= columns
      )
        return false
      if (rule.kind === 'equals' || rule.kind === 'contains')
        return (
          typeof rule.value === 'string' &&
          rule.value.length <= 32767 &&
          (rule.caseSensitive === undefined || typeof rule.caseSensitive === 'boolean')
        )
      if (rule.kind === 'list')
        return (
          Array.isArray(rule.values) &&
          rule.values.length <= 1000 &&
          rule.values.every((item: unknown) => typeof item === 'string' && item.length <= 32767)
        )
      return (
        rule.kind === 'range' &&
        (rule.min !== undefined || rule.max !== undefined) &&
        (rule.min === undefined || Number.isFinite(rule.min)) &&
        (rule.max === undefined || Number.isFinite(rule.max)) &&
        (rule.min === undefined || rule.max === undefined || rule.min <= rule.max)
      )
    }) && new Set(value.map((rule) => rule.colIndex)).size === value.length
  )
}
