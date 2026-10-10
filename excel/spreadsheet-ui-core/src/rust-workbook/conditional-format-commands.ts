import type {
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '../backend/projection-contracts'
import type {
  CellValueRule,
  ConditionalFormatRuleEntry,
  ConditionalFormatScope,
} from '../conditional-formatting/types'
import type { WorkerCommand } from '../rust-worker/types'

/** Rust 规则目录的只读投影；不是另一份可写的条件格式仓库。 */
export interface NativeConditionalFormats {
  readonly revision: number
  readonly rules: readonly ConditionalFormatRuleEntry[]
}

export type ConditionalFormatChange =
  | {
      readonly action: 'set'
      readonly revision: number
      readonly ruleId?: string
      readonly scope: ConditionalFormatScope
      readonly priority: number
      readonly rule: CellValueRule
    }
  | { readonly action: 'remove'; readonly revision: number; readonly ruleId: string }

export interface RustConditionalFormatCommands {
  'conditionalFormat.change': WorkerCommand<
    ConditionalFormatChange & {
      readonly sheetId: string
      readonly projection: VisibleProjectionRequest
    },
    { readonly projection: VisibleProjectionResult }
  >
}

/** 只验证目录的传输形状，条件含义仍交给 Rust，不在宿主做第二次求值。 */
export function validNativeConditionalFormats(config: NativeConditionalFormats): boolean {
  if (
    !config ||
    !Number.isSafeInteger(config.revision) ||
    config.revision < 0 ||
    !Array.isArray(config.rules)
  )
    return false
  const ids = new Set<string>()
  return config.rules.every((entry) => {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      ids.has(entry.id) ||
      !Number.isSafeInteger(entry.priority) ||
      !entry.rule ||
      typeof entry.rule.kind !== 'string'
    )
      return false
    ids.add(entry.id)
    const range = entry.scope?.range
    return (
      !!range &&
      [range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ) &&
      range.rowEnd >= range.rowStart &&
      range.colEnd >= range.colStart &&
      range.rowEnd < 1_048_576 &&
      range.colEnd < 16_384
    )
  })
}
