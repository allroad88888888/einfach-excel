import { atom } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import {
  renameTableCapabilityBackingAtom,
  renameTableColumnCapabilityBackingAtom,
} from './table-capabilities'
import { refreshTableCatalogAtom } from './table-catalog'
import { activeRenameTableAtom, tableRequestIdBackingAtom } from './table-command-lanes'
import {
  lastRenamedTableBackingAtom,
  setDiagnostic,
  tableDiagnosticBackingAtom,
} from './table-feedback'
import {
  captureTableHistoryEntryRecorder,
  recordTableHistory,
} from './table-history'
import {
  operationRejectionMessage,
  TABLE_COLUMN_NAME_UNCHANGED_ERROR,
  TABLE_HISTORY_SKEW_MESSAGE,
  TABLE_INVALID_NAME_ERROR,
  TABLE_MISSING_TARGET_ERROR,
  TABLE_NAME_LIKE_CELL_REF_ERROR,
  TABLE_NAME_UNCHANGED_ERROR,
  TABLE_RENAME_CAPABILITY_ERROR,
  TABLE_RENAME_COLUMN_CAPABILITY_ERROR,
  TABLE_RENAME_REJECTION_MESSAGES,
} from './table-messages'
import { isCellRefLikeTableName, isValidTableName } from './table-name-rules'
import {
  errorMessage,
  nextRequestId,
  readRenameTableColumnPort,
  readRenameTablePort,
} from './table-port-access'
import type { TableMutationRejectionCode, TableMutationResult, TablesControllerPort } from './types'

// --- rename / delete (design §9, parity #32 T7) -----------------------------
//
// Definition-level table lifecycle. Every command follows the same shape as
// `runCreateTableAtom`: capability split by port presence (the witness atom
// is refreshed on every dispatch), a local pre-validation gate that rejects
// without spending a transport round-trip, a single-flight lane, a
// structured-reject → readable-diagnostic mapping, and a catalog refresh
// from the canonical engine registry on apply.

export interface RunRenameTableInput {
  readonly source: TablesControllerPort
  /** Host capability guard captured before the backend mutation starts. */
  readonly historyEntryRecorder: HistoryEntryRecorder
  /** Current canonical table name. */
  readonly name: string
  /** Requested new name. */
  readonly newName: string
  /** Sheet id forwarded to `refreshProjection` after the rename lands. */
  readonly sheetId?: string
  /** Optional post-apply projection refresh (structured refs re-render). */
  readonly refreshProjection?: (sheetId?: string) => Promise<unknown> | unknown
}

/**
 * Rename a table through `renameTable`. Capability-gated: a host without the
 * port surfaces a capability diagnostic and never touches the engine.
 * Pre-validated locally — an empty target, an empty / malformed new name, a
 * cell-ref-like new name, or a new name identical to the current one is
 * rejected before any transport. On apply the bounded catalog is refreshed
 * from the canonical registry (so every descriptor carries the new name) and
 * the rename witness is published; a structured reject (`name-conflict` /
 * `reserved-name` / `not-found` / …) maps to a readable diagnostic.
 */
export const runRenameTableAtom = atom(
  null,
  async (get, set, input: RunRenameTableInput): Promise<void> => {
    if (get(activeRenameTableAtom)) return

    const port = readRenameTablePort(input.source)
    set(renameTableCapabilityBackingAtom, port !== undefined)
    if (port === undefined) {
      setDiagnostic(set, 'capability', TABLE_RENAME_CAPABILITY_ERROR)
      return
    }

    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (name.length === 0) {
      setDiagnostic(set, 'invalid-payload', TABLE_MISSING_TARGET_ERROR)
      return
    }

    const newName = typeof input.newName === 'string' ? input.newName.trim() : ''
    if (!isValidTableName(newName)) {
      setDiagnostic(set, 'invalid-name', TABLE_INVALID_NAME_ERROR)
      return
    }
    if (isCellRefLikeTableName(newName)) {
      setDiagnostic(set, 'name-like-cell-ref', TABLE_NAME_LIKE_CELL_REF_ERROR)
      return
    }
    // An exact no-op is rejected locally; a case-only change is a real
    // display-case edit and is forwarded to the engine.
    if (newName === name) {
      setDiagnostic(set, 'name-unchanged', TABLE_NAME_UNCHANGED_ERROR)
      return
    }

    const historyEntryRecorder = captureTableHistoryEntryRecorder(input)
    if (historyEntryRecorder === null) {
      setDiagnostic(set, 'invalid-payload', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }

    const requestId = nextRequestId(get(tableRequestIdBackingAtom))
    set(tableRequestIdBackingAtom, requestId)
    set(activeRenameTableAtom, true)
    set(tableDiagnosticBackingAtom, null)

    let result: TableMutationResult
    try {
      result = await port.call(input.source, { kind: 'rename-table', name, newName, requestId })
    } catch (error) {
      set(activeRenameTableAtom, false)
      setDiagnostic(set, 'outcome-unknown', `Rename result is unknown: ${errorMessage(error)}`)
      return
    }

    if (!result || result.applied === false) {
      const code: TableMutationRejectionCode = result ? result.code : 'invalid-payload'
      set(activeRenameTableAtom, false)
      setDiagnostic(
        set,
        code,
        operationRejectionMessage(TABLE_RENAME_REJECTION_MESSAGES, code, result?.message),
      )
      return
    }

    const historyResult = recordTableHistory(
      set,
      historyEntryRecorder,
      input.sheetId ?? null,
      result.revision,
    )
    if (historyResult === 'rejected') {
      set(activeRenameTableAtom, false)
      setDiagnostic(set, 'outcome-unknown', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }
    set(lastRenamedTableBackingAtom, Object.freeze({ from: name, to: result.name }))
    await set(refreshTableCatalogAtom, input.source)
    if (typeof input.refreshProjection === 'function') {
      try {
        await input.refreshProjection(input.sheetId)
      } catch {
        // Projection refresh failure is non-fatal; the rename landed.
      }
    }
    set(activeRenameTableAtom, false)
    set(tableDiagnosticBackingAtom, null)
  },
)
runRenameTableAtom.debugLabel = 'spreadsheet.tables.runRename'

export interface RunRenameTableColumnInput {
  readonly source: TablesControllerPort
  /** Host capability guard captured before the backend mutation starts. */
  readonly historyEntryRecorder: HistoryEntryRecorder
  readonly name: string
  readonly oldColumn: string
  readonly newColumn: string
  readonly sheetId?: string
  readonly refreshProjection?: (sheetId?: string) => Promise<unknown> | unknown
}

/**
 * Rename one table column through `renameTableColumn`. Column display names
 * are free text (unlike the table name), so the local gate only rejects an
 * empty target / empty new column / exact no-op; duplicate and
 * invalid-column-name verdicts stay with the engine.
 */
export const runRenameTableColumnAtom = atom(
  null,
  async (get, set, input: RunRenameTableColumnInput): Promise<void> => {
    const port = readRenameTableColumnPort(input.source)
    set(renameTableColumnCapabilityBackingAtom, port !== undefined)
    if (port === undefined) {
      setDiagnostic(set, 'capability', TABLE_RENAME_COLUMN_CAPABILITY_ERROR)
      return
    }

    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const oldColumn = typeof input.oldColumn === 'string' ? input.oldColumn.trim() : ''
    if (name.length === 0 || oldColumn.length === 0) {
      setDiagnostic(set, 'invalid-payload', TABLE_MISSING_TARGET_ERROR)
      return
    }

    const newColumn = typeof input.newColumn === 'string' ? input.newColumn.trim() : ''
    if (newColumn.length === 0) {
      setDiagnostic(
        set,
        'invalid-column-name',
        operationRejectionMessage(TABLE_RENAME_REJECTION_MESSAGES, 'invalid-column-name'),
      )
      return
    }
    if (newColumn === oldColumn) {
      setDiagnostic(set, 'name-unchanged', TABLE_COLUMN_NAME_UNCHANGED_ERROR)
      return
    }

    const historyEntryRecorder = captureTableHistoryEntryRecorder(input)
    if (historyEntryRecorder === null) {
      setDiagnostic(set, 'invalid-payload', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }

    const requestId = nextRequestId(get(tableRequestIdBackingAtom))
    set(tableRequestIdBackingAtom, requestId)
    set(tableDiagnosticBackingAtom, null)

    let result: TableMutationResult
    try {
      result = await port.call(input.source, {
        kind: 'rename-table-column',
        name,
        oldColumn,
        newColumn,
        requestId,
      })
    } catch (error) {
      setDiagnostic(
        set,
        'outcome-unknown',
        `Column rename result is unknown: ${errorMessage(error)}`,
      )
      return
    }

    if (!result || result.applied === false) {
      const code: TableMutationRejectionCode = result ? result.code : 'invalid-payload'
      setDiagnostic(
        set,
        code,
        operationRejectionMessage(TABLE_RENAME_REJECTION_MESSAGES, code, result?.message),
      )
      return
    }

    const historyResult = recordTableHistory(
      set,
      historyEntryRecorder,
      input.sheetId ?? null,
      result.revision,
    )
    if (historyResult === 'rejected') {
      setDiagnostic(set, 'outcome-unknown', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }
    await set(refreshTableCatalogAtom, input.source)
    if (typeof input.refreshProjection === 'function') {
      try {
        await input.refreshProjection(input.sheetId)
      } catch {
        // Projection refresh failure is non-fatal; the rename landed.
      }
    }
    set(tableDiagnosticBackingAtom, null)
  },
)
runRenameTableColumnAtom.debugLabel = 'spreadsheet.tables.runRenameColumn'
