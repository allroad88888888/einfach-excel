import type { RustImportCell, RustImportStats } from './commands'

export interface RustCellSnapshot {
  readonly sheet: number
  readonly addr: string
  readonly display: string
  readonly type: 'number' | 'text' | 'boolean' | 'error' | 'null'
  readonly isError: boolean
  readonly formula: string
}

export interface RustWriteOutcome {
  readonly ok?: boolean
  readonly installed?: boolean
  readonly code?: string
}

export interface WasmWorkbook {
  sheet_count(): number
  sheet_name(index: number): string
  add_sheet(name: string): number
  rename_sheet(index: number, name: string): boolean
  trySetCellNumber?: (sheet: number, addr: string, value: number) => RustWriteOutcome
  trySetCellText?: (sheet: number, addr: string, value: string) => RustWriteOutcome
  trySetCellBoolean?: (sheet: number, addr: string, value: boolean) => RustWriteOutcome
  tryClearCellAt?: (sheet: number, addr: string) => RustWriteOutcome
  trySetFormulaAt?: (sheet: number, addr: string, formula: string) => RustWriteOutcome
  snapshotCell(sheet: number, addr: string): RustCellSnapshot
  bulk_import_cells(cells: readonly RustImportCell[]): RustImportStats
  read_sparse_range?: (
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ) => RustCellSnapshot[]
}

export interface RustWasmModule {
  default(): Promise<unknown>
  WasmWorkbook: new () => unknown
}
