import type { ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult } from '../../backend'
import type { CellRange } from '../../shared'
import type { SheetProtectionState } from '../../protection/types'
import type { WorkerCommand } from '../../rust-worker/types'
import type { RustWorkbookSheet } from '../commands'
import { validateProjectionRequest } from '../../projection/contracts'

export type NativeProtectionChange =
  | { readonly action: 'protect' | 'unprotect' }
  | { readonly action: 'allow-range'; readonly range: CellRange }
  | { readonly action: 'remove-range'; readonly index: number }

export interface RustProtectionCommands {
  'protection.read': WorkerCommand<{ readonly sheetId: string }, SheetProtectionState>
  'protection.change': WorkerCommand<{
    readonly sheetId: string
    readonly change: NativeProtectionChange
    readonly revision: ProjectionRevision
    readonly projection: VisibleProjectionRequest
  }, {
    readonly changed: boolean
    readonly protection: SheetProtectionState
    readonly projection: VisibleProjectionResult
  }>
}

export interface WasmProtectionQueries {
  read_protection?: (sheet: number) => SheetProtectionState
  change_protection?: (sheet: number, change: NativeProtectionChange) => boolean
}

export function validNativeProtection(value: unknown): value is SheetProtectionState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<SheetProtectionState>
  return ['open', 'protected'].includes(state.mode ?? '') && Array.isArray(state.unlockedRanges) &&
    state.unlockedRanges.length <= 256 && state.unlockedRanges.every(validRange)
}

function validRange(value: unknown): value is CellRange {
  if (!value || typeof value !== 'object') return false
  const r = value as CellRange
  return [r.rowStart, r.rowEnd, r.colStart, r.colEnd].every(Number.isSafeInteger) &&
    r.rowStart >= 0 && r.colStart >= 0 && r.rowStart <= r.rowEnd && r.colStart <= r.colEnd &&
    r.rowEnd < 1_048_576 && r.colEnd < 16_384
}

export function readProtection(workbook: WasmProtectionQueries,
  sheets: ReadonlyMap<string, RustWorkbookSheet>, input: { readonly sheetId: string },
): SheetProtectionState {
  const sheet = sheets.get(input.sheetId)
  if (!sheet) throw new Error('The worksheet no longer exists.')
  if (!workbook.read_protection) throw new Error('Rust worksheet protection is unavailable.')
  const result = workbook.read_protection(sheet.index)
  if (!validNativeProtection(result)) throw new Error('Rust returned invalid worksheet protection.')
  return result
}

/** Worker validates transport witnesses; permissions and settings belong to Rust. */
export function changeProtection(workbook: WasmProtectionQueries,
  sheets: ReadonlyMap<string, RustWorkbookSheet>,
  input: RustProtectionCommands['protection.change']['payload'], revision: number,
): boolean {
  const sheet = sheets.get(input.sheetId)
  if (!sheet) throw new Error('The worksheet no longer exists.')
  if (input.sheetId !== input.projection.sheetId || !validateProjectionRequest(input.projection).ok)
    throw new Error('Invalid protection projection request.')
  if (input.revision !== revision) throw new Error('The workbook changed. Reopen worksheet protection.')
  const change = input.change
  if (!change || !['protect', 'unprotect', 'allow-range', 'remove-range'].includes(change.action))
    throw new Error('Invalid protection change.')
  if (change.action === 'allow-range' && (!validRange(change.range) ||
    change.range.rowEnd >= (sheet.rowCount ?? 1_048_576) ||
    change.range.colEnd >= (sheet.colCount ?? 16_384)))
    throw new Error('The editable range is outside the worksheet.')
  if (change.action === 'remove-range' && (!Number.isSafeInteger(change.index) || change.index < 0))
    throw new Error('The editable range no longer exists.')
  if (!workbook.change_protection) throw new Error('Rust worksheet protection is unavailable.')
  return workbook.change_protection(sheet.index, change)
}
