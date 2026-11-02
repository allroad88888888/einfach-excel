import { atom } from '@einfach/core'
import { applyGoToTargetAtom } from '../go-to'
import { parseGoToReference } from '../go-to/reference-parser'
import type { GoToParseResult } from '../go-to/types'
import { coordToA1 } from '../name-box/address'
import { nativeNamedRangesAtom, resolveNativeNamedRange } from '../named-ranges/native-catalog'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import type { CellRange } from '../shared'
import { scrollToCellAtom } from '../viewport/metrics'
import type { WatchTargetEntry } from './types'

export interface WatchWindowState {
  readonly open: boolean
  readonly busy: boolean
  readonly error?: string
  readonly draftInput: string
  readonly selectedId: string | null
  readonly entries: readonly WatchTargetEntry[]
}

const INITIAL_WATCH_STATE: WatchWindowState = Object.freeze({
  open: false,
  busy: false,
  draftInput: '',
  selectedId: null,
  entries: Object.freeze([]),
})

const watchWindowBackingAtom = atom<WatchWindowState>(INITIAL_WATCH_STATE)
watchWindowBackingAtom.debugLabel = 'spreadsheet.formulaAuditing.watchBacking'

export const watchEntriesAtom = atom((get): readonly WatchTargetEntry[] => {
  return get(watchWindowBackingAtom).entries
})
watchEntriesAtom.debugLabel = 'spreadsheet.formulaAuditing.watchEntries'

export const watchWindowPanelAtom = atom((get): WatchWindowState => {
  return get(watchWindowBackingAtom)
})
watchWindowPanelAtom.debugLabel = 'spreadsheet.formulaAuditing.watchPanel'

function watchEntryId(sheetId: string, row: number, col: number): string {
  return `${sheetId}:${row}:${col}`
}

function expandRangeTargets(
  sheetId: string,
  sheetIndex: number,
  sheetName: string,
  range: CellRange,
  limit = 64,
): WatchTargetEntry[] {
  const results: WatchTargetEntry[] = []
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      if (results.length >= limit) return results
      results.push(
        Object.freeze({
          id: watchEntryId(sheetId, row, col),
          sheetId,
          sheetIndex,
          sheetName,
          row,
          col,
          addr: coordToA1({ row, col }),
          name: '',
          value: '',
          formula: '',
          isError: false,
        }),
      )
    }
  }
  return results
}

export const syncWatchedCellsAtom = atom(null, async (get, set): Promise<boolean> => {
  const current = get(watchWindowBackingAtom)
  if (current.entries.length === 0) return true
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection) return false

  try {
    const snapshots = await connection.request('formulaAuditing.watch', {
      targets: current.entries.map((entry) => ({
        sheetId: entry.sheetId,
        row: entry.row,
        col: entry.col,
      })),
    })
    const byKey = new Map(
      snapshots.map((item) => [watchEntryId(item.sheetId, item.row, item.col), item]),
    )
    const latest = get(watchWindowBackingAtom)
    const nextEntries = latest.entries.map((entry) => {
      const updated = byKey.get(entry.id)
      if (!updated) return entry
      return Object.freeze({
        ...entry,
        sheetIndex: updated.sheetIndex,
        sheetName: updated.sheetName,
        addr: updated.addr,
        name: updated.name ?? '',
        value: updated.value,
        formula: updated.formula,
        isError: updated.isError,
      })
    })
    set(
      watchWindowBackingAtom,
      Object.freeze({
        ...latest,
        busy: false,
        entries: Object.freeze(nextEntries),
      }),
    )
    return true
  } catch {
    return false
  }
})
syncWatchedCellsAtom.debugLabel = 'spreadsheet.formulaAuditing.syncWatchedCells'

export type WatchWindowAction =
  | 'open'
  | 'close'
  | 'toggle'
  | 'add-selection'
  | 'delete-selected'
  | 'refresh'
  | { readonly addReference: string }
  | { readonly setDraft: string }
  | { readonly select: string }
  | { readonly delete: string }
  | { readonly navigate: string }

export const runWatchWindowAtom = atom(
  null,
  async (get, set, action: WatchWindowAction): Promise<boolean> => {
    const current = get(watchWindowBackingAtom)

    if (action === 'close') {
      set(watchWindowBackingAtom, Object.freeze({ ...current, open: false, error: undefined }))
      return true
    }

    if (action === 'open' || action === 'toggle') {
      const nextOpen = action === 'open' ? true : !current.open
      set(watchWindowBackingAtom, Object.freeze({ ...current, open: nextOpen, error: undefined }))
      if (nextOpen && current.entries.length > 0) {
        await set(syncWatchedCellsAtom)
      }
      return true
    }

    if (action === 'refresh') {
      return set(syncWatchedCellsAtom)
    }

    if (typeof action === 'object' && 'setDraft' in action) {
      set(
        watchWindowBackingAtom,
        Object.freeze({
          ...current,
          draftInput: action.setDraft.slice(0, 256),
          error: undefined,
        }),
      )
      return true
    }

    if (typeof action === 'object' && 'select' in action) {
      set(
        watchWindowBackingAtom,
        Object.freeze({
          ...current,
          selectedId: action.select,
          error: undefined,
        }),
      )
      return true
    }

    if (action === 'delete-selected' || (typeof action === 'object' && 'delete' in action)) {
      const targetId =
        typeof action === 'object' && 'delete' in action ? action.delete : current.selectedId
      if (!targetId) return false
      const remaining = current.entries.filter((entry) => entry.id !== targetId)
      const nextSelected =
        current.selectedId === targetId ? (remaining[0]?.id ?? null) : current.selectedId
      set(
        watchWindowBackingAtom,
        Object.freeze({
          ...current,
          entries: Object.freeze(remaining),
          selectedId: nextSelected,
          error: undefined,
        }),
      )
      return true
    }

    if (typeof action === 'object' && 'navigate' in action) {
      const entry = current.entries.find((item) => item.id === action.navigate)
      if (!entry) return false
      const sheets = get(workbookDocumentAtom).sheets
      const active = get(activeWorkbookSheetAtom)
      const targetSheet = sheets.find((item) => item.id === entry.sheetId)
      if (!targetSheet || !active) return false
      if (targetSheet.id !== active.id) {
        set(activateWorkbookSheetAtom, targetSheet)
      }
      set(applyGoToTargetAtom, {
        sheetId: targetSheet.id,
        sheetName: targetSheet.name,
        coord: { row: entry.row, col: entry.col },
        range: {
          rowStart: entry.row,
          rowEnd: entry.row,
          colStart: entry.col,
          colEnd: entry.col,
        },
        source: 'A1',
      })
      set(scrollToCellAtom, {
        coord: { row: entry.row, col: entry.col },
        rowAlign: 'nearest',
        colAlign: 'nearest',
      })
      set(
        watchWindowBackingAtom,
        Object.freeze({
          ...get(watchWindowBackingAtom),
          selectedId: entry.id,
        }),
      )
      return true
    }

    const activeSheet = get(activeWorkbookSheetAtom)
    const sheets = get(workbookDocumentAtom).sheets
    if (!activeSheet) return false

    const rawRef =
      typeof action === 'object' && 'addReference' in action
        ? action.addReference.trim()
        : current.draftInput.trim()

    let candidateEntries: WatchTargetEntry[] = []

    if (action === 'add-selection' && rawRef.length === 0) {
      const snap = get(selectionSnapshotAtom)
      const sheet = sheets.find((item) => item.id === snap.selection.sheetId) ?? activeSheet
      candidateEntries = expandRangeTargets(sheet.id, sheet.index, sheet.name, snap.range)
    } else if (rawRef.length > 0) {
      const named = resolveNativeNamedRange(rawRef, get(nativeNamedRangesAtom), sheets)
      if (named === null) {
        set(
          watchWindowBackingAtom,
          Object.freeze({
            ...current,
            error: 'Invalid watch reference.',
          }),
        )
        return false
      }
      const parsed: GoToParseResult = named
        ? { ok: true, target: named }
        : parseGoToReference(rawRef, {
            activeSheetId: activeSheet.id,
            activeCell: get(selectionSnapshotAtom).activeCell,
            sheets,
            registry: [],
          })
      if (!parsed.ok) {
        set(
          watchWindowBackingAtom,
          Object.freeze({
            ...current,
            error: 'Enter a valid cell, range, or defined name (e.g. B5 or Sheet2!B5).',
          }),
        )
        return false
      }
      const targetSheet = sheets.find((item) => item.id === parsed.target.sheetId)
      const range =
        parsed.target.range ??
        (parsed.target.coord
          ? {
              rowStart: parsed.target.coord.row,
              rowEnd: parsed.target.coord.row,
              colStart: parsed.target.coord.col,
              colEnd: parsed.target.coord.col,
            }
          : null)
      if (!targetSheet || !range) {
        set(
          watchWindowBackingAtom,
          Object.freeze({
            ...current,
            error: 'Target worksheet or cell range is unavailable.',
          }),
        )
        return false
      }
      candidateEntries = expandRangeTargets(
        targetSheet.id,
        targetSheet.index,
        targetSheet.name,
        range,
      )
    } else {
      const snap = get(selectionSnapshotAtom)
      const sheet = sheets.find((item) => item.id === snap.selection.sheetId) ?? activeSheet
      candidateEntries = expandRangeTargets(sheet.id, sheet.index, sheet.name, snap.range)
    }

    if (candidateEntries.length === 0) return false

    const existingIds = new Set(current.entries.map((entry) => entry.id))
    const merged = [...current.entries]
    for (const entry of candidateEntries) {
      if (!existingIds.has(entry.id)) {
        existingIds.add(entry.id)
        merged.push(entry)
      }
    }

    const lastAddedId = candidateEntries[candidateEntries.length - 1]?.id ?? current.selectedId
    set(
      watchWindowBackingAtom,
      Object.freeze({
        ...current,
        open: true,
        draftInput: '',
        error: undefined,
        selectedId: lastAddedId,
        entries: Object.freeze(merged),
      }),
    )

    await set(syncWatchedCellsAtom)
    return true
  },
)
runWatchWindowAtom.debugLabel = 'spreadsheet.formulaAuditing.runWatchWindow'
