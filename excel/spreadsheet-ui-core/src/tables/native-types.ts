import type { CellRange } from '../shared'
import { parseA1Range } from '../name-box/address'

/** Rust Table 注册表的只读投影，不在 UI Core 重建定义。 */
export interface NativeTable {
  readonly name: string
  readonly sheet: string
  readonly sheetIndex: number
  readonly range: string
  readonly hasHeaders: boolean
  readonly hasTotals: boolean
  readonly columns: readonly string[]
}
export type TableChange =
  | { readonly kind: 'create'; readonly name?: string; readonly range: CellRange }
  | { readonly kind: 'rename'; readonly name: string; readonly newName: string }
  | { readonly kind: 'convert-to-range'; readonly name: string }
export type NativeTableAction = Exclude<TableChange, { kind: 'create' }> |
  { readonly kind: 'create'; readonly name?: string; readonly range: readonly [number, number, number, number] }

/** 仅校验响应结构；名称冲突和结构化引用语义由 Rust 判断。 */
export function validNativeTables(value: unknown): value is readonly NativeTable[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry.name !== 'string' || !entry.name.length ||
      typeof entry.sheet !== 'string' || !entry.sheet.length ||
      !Number.isSafeInteger(entry.sheetIndex) || entry.sheetIndex < 0 ||
      typeof entry.range !== 'string' || typeof entry.hasHeaders !== 'boolean' ||
      typeof entry.hasTotals !== 'boolean' || !Array.isArray(entry.columns) ||
      !entry.columns.every((column: unknown) => typeof column === 'string' && column.length > 0))
      return false
    const range = parseA1Range(entry.range)
    return Boolean(range && range.rowEnd < 1_048_576 && range.colEnd < 16_384 &&
      entry.columns.length === range.colEnd - range.colStart + 1)
  })
}
