import type { RichTextRun, SpreadsheetCellFormat } from '../contracts'

/** 导入坐标为零基：row=0、col=0 表示 A1。 */
type RustImportCellValue =
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'number'
      readonly value: number
    }
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'text'
      readonly value: string
      readonly richText?: readonly RichTextRun[]
    }
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'boolean'
      readonly value: boolean
    }
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'error'
      readonly value: string
    }
  | {
      readonly sheet: number
      readonly row: number
      readonly col: number
      readonly kind: 'formula'
      readonly value: string
    }
  | { readonly sheet: number; readonly row: number; readonly col: number; readonly kind: 'null' }

/** Rust 批量导入格；可选格式仍直接写入 Rust，不产生 React 数据副本。 */
export type RustImportCell = RustImportCellValue & {
  readonly format?: SpreadsheetCellFormat
}

export interface RustImportStats {
  readonly accepted: number
  readonly formulas: number
  readonly rejectedFormulas: number
  readonly cleared: number
  readonly errors: number
  readonly issues?: readonly unknown[]
}

