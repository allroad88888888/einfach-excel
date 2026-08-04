import type { Getter, Setter } from '@einfach/core'
import type { ProjectionRevision, SheetListResult, SpreadsheetBackend, SpreadsheetSheetMetadata } from '../backend'
import { sheetTabsRequestSequenceAtom } from './state'
import type { CapturedSheetTabsPorts, SheetTabsCapabilities, SheetTabsState } from './types'
import { normalizeSheetMetadataList } from './metadata'

export interface SheetListProjectionSnapshot { sheets: SpreadsheetSheetMetadata[]; revision?: ProjectionRevision }

export function nextSheetTabIdentity(current: number): number | null { return !Number.isSafeInteger(current) || current < 0 || current === Number.MAX_SAFE_INTEGER ? null : current + 1 }
export function issueSheetTabRequestId(get: Getter, set: Setter): number | null { const next = nextSheetTabIdentity(get(sheetTabsRequestSequenceAtom)); if (next === null) return null; set(sheetTabsRequestSequenceAtom, next); return next }

export function captureSheetTabsPorts(backend: SpreadsheetBackend): CapturedSheetTabsPorts {
  const { listSheets, addSheet, renameSheet, deleteSheet, reorderSheet } = backend
  return {
    ...(typeof listSheets === 'function' ? { listSheets: () => listSheets.call(backend) } : {}),
    ...(typeof addSheet === 'function' ? { addSheet: (request: Parameters<typeof addSheet>[0]) => addSheet.call(backend, request) } : {}),
    ...(typeof renameSheet === 'function' ? { renameSheet: (request: Parameters<typeof renameSheet>[0]) => renameSheet.call(backend, request) } : {}),
    ...(typeof deleteSheet === 'function' ? { deleteSheet: (request: Parameters<typeof deleteSheet>[0]) => deleteSheet.call(backend, request) } : {}),
    ...(typeof reorderSheet === 'function' ? { reorderSheet: (request: Parameters<typeof reorderSheet>[0]) => reorderSheet.call(backend, request) } : {}),
  }
}

export function capabilitiesFromPorts(ports: CapturedSheetTabsPorts): SheetTabsCapabilities {
  const list = typeof ports.listSheets === 'function'
  return { list, add: list && typeof ports.addSheet === 'function', rename: list && typeof ports.renameSheet === 'function', delete: list && typeof ports.deleteSheet === 'function', reorder: list && typeof ports.reorderSheet === 'function' }
}

export function sheetTabMutationCanStart(state: SheetTabsState, kind: keyof SheetTabsCapabilities): boolean { return state.phase === 'ready' && state.sessionId > 0 && state.mutation === null && state.capabilities.list && state.capabilities[kind] }

export function snapshotSheetListProjection(result: unknown): SheetListProjectionSnapshot | null {
  if (typeof result !== 'object' || result === null) return null
  const record = result as Record<string, unknown>
  if (!Array.isArray(record.sheets) || record.sheets.length === 0) return null
  const source = record.sheets as SpreadsheetSheetMetadata[]
  const sheets = normalizeSheetMetadataList(source)
  if (sheets.length !== source.length) return null
  const revision = record.revision
  if (revision !== undefined && typeof revision !== 'string' && !(typeof revision === 'number' && Number.isFinite(revision))) return null
  return { sheets, ...(revision === undefined ? {} : { revision: revision as ProjectionRevision }) }
}

export function sheetTabErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message.trim()
  return typeof error === 'string' && error.trim().length > 0 ? error.trim() : fallback
}

export type { SheetListResult }
