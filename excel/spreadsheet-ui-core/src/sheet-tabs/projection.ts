import type { Getter, Setter } from '@einfach/core'
import type { ProjectionRevision, SpreadsheetSheetMetadata } from '../backend'
import { selectCellAtom, selectionSnapshotAtom } from '../selection'
import { setWorkspaceActiveSheetAtom, workspaceSessionAtom } from '../workspace'
import { sheetTabsSheetStateAtom } from './state'
import type { ActivateSheetTabInput } from './types'
import { normalizeSheetMetadataList } from './metadata'

export function activateSheetTab(get: Getter, set: Setter, input: ActivateSheetTabInput): boolean {
  if (typeof input !== 'object' || input === null || typeof input.sheetId !== 'string' || input.sheetId.length === 0 || !get(sheetTabsSheetStateAtom).sheets.some((sheet) => sheet.id === input.sheetId)) return false
  const workspace = get(workspaceSessionAtom)
  const selection = get(selectionSnapshotAtom)
  if (workspace.activeSheetId !== input.sheetId) set(setWorkspaceActiveSheetAtom, { sheetId: input.sheetId })
  if (selection.activeCell.sheetId !== input.sheetId) set(selectCellAtom, { sheetId: input.sheetId, coord: { row: selection.activeCell.row, col: selection.activeCell.col }, extend: false })
  return true
}

export function commitFallbackActiveSheet(get: Getter, set: Setter, sheets: readonly SpreadsheetSheetMetadata[]): void {
  const activeSheetId = get(workspaceSessionAtom).activeSheetId
  const next = sheets.some((sheet) => sheet.id === activeSheetId) ? activeSheetId : (sheets[0]?.id ?? null)
  if (next === null) { if (activeSheetId !== null) set(setWorkspaceActiveSheetAtom, { sheetId: null }); return }
  activateSheetTab(get, set, { sheetId: next })
}

export function commitSheetProjection(get: Getter, set: Setter, sheets: readonly SpreadsheetSheetMetadata[], revision: ProjectionRevision | undefined, preferredActiveSheetId: string | null): void {
  const normalized = normalizeSheetMetadataList(sheets)
  set(sheetTabsSheetStateAtom, { sheets: normalized, revision })
  const current = get(workspaceSessionAtom).activeSheetId
  const next = (preferredActiveSheetId && normalized.some((sheet) => sheet.id === preferredActiveSheetId) ? preferredActiveSheetId : null) ?? (current && normalized.some((sheet) => sheet.id === current) ? current : null) ?? normalized[0]?.id ?? null
  if (next === null) { if (current !== null) set(setWorkspaceActiveSheetAtom, { sheetId: null }); return }
  activateSheetTab(get, set, { sheetId: next })
}
