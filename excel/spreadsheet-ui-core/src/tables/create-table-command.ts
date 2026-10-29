import { atom } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import type { CellRange } from '../shared'
import { createTableCapabilityBackingAtom } from './table-capabilities'
import { refreshTableCatalogAtom } from './table-catalog'
import { activeCreateTableAtom, tableRequestIdBackingAtom } from './table-command-lanes'
import {
  lastCreatedTableNameBackingAtom,
  setDiagnostic,
  tableDiagnosticBackingAtom,
} from './table-feedback'
import { isValidCreateTableRange, normalizeRange } from './table-geometry'
import {
  captureTableHistoryEntryRecorder,
  recordTableHistory,
} from './table-history'
import {
  TABLE_CAPABILITY_ERROR,
  TABLE_HISTORY_SKEW_MESSAGE,
  TABLE_INVALID_SELECTION_ERROR,
  tableRejectionMessage,
} from './table-messages'
import { errorMessage, nextRequestId, readCreateTablePort } from './table-port-access'
import type { CreateTableResult, TableMutationRejectionCode, TablesControllerPort } from './types'

// --- create table command ---------------------------------------------------

export interface RunCreateTableInput {
  readonly source: TablesControllerPort
  /** Host capability guard captured before the backend mutation starts. */
  readonly historyEntryRecorder: HistoryEntryRecorder
  readonly sheetId: string
  readonly range: CellRange
  /** Optional explicit name; omit to let the engine auto-generate `Table1..N`. */
  readonly name?: string
  /** Optional post-apply projection refresh (structured refs recompute on read). */
  readonly refreshProjection?: (sheetId: string) => Promise<unknown> | unknown
}

/**
 * Create an Excel Table over the current selection. Capability-gated: when
 * the host omits `createTable` the command surfaces a capability diagnostic
 * and never touches the engine. An invalid selection is rejected locally.
 * On an applied result the bounded catalog is refreshed from the engine
 * (canonical) and the last-created name is published; a structured reject
 * (name-conflict / range-overlap / too-many-tables / …) maps to a
 * user-readable diagnostic without a thrown promise.
 */
export const runCreateTableAtom = atom(
  null,
  async (get, set, input: RunCreateTableInput): Promise<void> => {
    if (get(activeCreateTableAtom)) return

    const create = readCreateTablePort(input.source)
    set(createTableCapabilityBackingAtom, create !== undefined)
    if (create === undefined) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({ code: 'capability', message: TABLE_CAPABILITY_ERROR }),
      )
      return
    }

    const range = input.range === undefined ? null : normalizeRange(input.range)
    if (!input.sheetId || range === null || !isValidCreateTableRange(range)) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({ code: 'invalid-selection', message: TABLE_INVALID_SELECTION_ERROR }),
      )
      return
    }

    const historyEntryRecorder = captureTableHistoryEntryRecorder(input)
    if (historyEntryRecorder === null) {
      setDiagnostic(set, 'invalid-payload', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }

    const requestId = nextRequestId(get(tableRequestIdBackingAtom))
    set(tableRequestIdBackingAtom, requestId)
    set(activeCreateTableAtom, true)
    set(tableDiagnosticBackingAtom, null)

    const name =
      typeof input.name === 'string' && input.name.trim().length > 0 ? input.name.trim() : undefined

    let result: CreateTableResult
    try {
      result = await create.call(input.source, {
        kind: 'create-table',
        sheetId: input.sheetId,
        range,
        ...(name === undefined ? {} : { name }),
        requestId,
      })
    } catch (error) {
      set(activeCreateTableAtom, false)
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({
          code: 'outcome-unknown',
          message: `Create table result is unknown: ${errorMessage(error)}`,
        }),
      )
      return
    }

    // Structured rejection (a gated request resolves, it does NOT reject the
    // promise): nothing was written, no catalog change.
    if (!result || result.applied === false) {
      const code: TableMutationRejectionCode = result ? result.code : 'invalid-payload'
      set(activeCreateTableAtom, false)
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({ code, message: tableRejectionMessage(code, result?.message) }),
      )
      return
    }

    // Applied — pair the adapter's transaction record with a UI-core entry
    // before publishing any local acknowledgement or refreshing the canonical
    // projection. A rejected recorder leaves the mutation outcome unknown.
    const historyResult = recordTableHistory(
      set,
      historyEntryRecorder,
      input.sheetId,
      result.revision,
    )
    if (historyResult === 'rejected') {
      set(activeCreateTableAtom, false)
      setDiagnostic(set, 'outcome-unknown', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }
    set(lastCreatedTableNameBackingAtom, result.name)
    await set(refreshTableCatalogAtom, input.source)
    if (typeof input.refreshProjection === 'function') {
      try {
        await input.refreshProjection(input.sheetId)
      } catch {
        // Projection refresh failure is non-fatal; the table exists.
      }
    }
    set(activeCreateTableAtom, false)
    set(tableDiagnosticBackingAtom, null)
  },
)
runCreateTableAtom.debugLabel = 'spreadsheet.tables.runCreate'
