import type { CellRange } from '../shared'

/** 原生目录的只读投影；无 target 且无 formula 代表已有范围定义失效（#REF!）。 */
export interface NativeNamedRange {
  readonly name: string
  readonly scope?: number | null
  readonly target?: {
    readonly sheet: number
    readonly range: readonly [number, number, number, number]
  } | null
  readonly formula?: string | null
}

export type NativeNamedRangeAction =
  | {
      readonly kind: 'create'
      readonly name: string
      readonly scope?: number
      readonly target?: NonNullable<NativeNamedRange['target']>
      readonly formula?: string
    }
  | {
      readonly kind: 'update'
      readonly name: string
      readonly scope?: number
      readonly newName: string
      readonly newScope?: number | null
      readonly target?: NativeNamedRange['target']
      readonly formula?: string
    }
  | { readonly kind: 'delete'; readonly name: string; readonly scope?: number }

type NamedRangeTarget = { readonly sheetId: string; readonly range: CellRange }
export type NamedRangeChange =
  | {
      readonly kind: 'create'
      readonly name: string
      readonly scopeSheetId?: string | null
      readonly target?: NamedRangeTarget
      readonly formula?: string
    }
  | {
      readonly kind: 'update'
      readonly name: string
      readonly scopeSheetId?: string | null
      readonly newName: string
      readonly newScopeSheetId?: string | null
      readonly target?: NamedRangeTarget
      readonly formula?: string
    }
  | { readonly kind: 'delete'; readonly name: string; readonly scopeSheetId?: string | null }

/** 只检查响应形状，不复制 Rust 的名称语法、冲突判断或求值逻辑。 */
export function validNativeNamedRanges(value: unknown): value is readonly NativeNamedRange[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry.name !== 'string' || !entry.name.length) return false
    if (entry.scope != null && (!Number.isSafeInteger(entry.scope) || entry.scope < 0)) return false
    if (entry.formula != null && (typeof entry.formula !== 'string' || !entry.formula.length)) return false
    if (entry.target == null) return true
    const { sheet, range } = entry.target
    return Number.isSafeInteger(sheet) && sheet >= 0 && Array.isArray(range) &&
      range.length === 4 && range.every((n) => Number.isSafeInteger(n) && n >= 0) &&
      range[0] <= range[2] && range[1] <= range[3] && range[2] < 1_048_576 && range[3] < 16_384
  })
}
