import { atom } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import { deleteTableCapabilityBackingAtom } from './table-capabilities'
import { refreshTableCatalogAtom } from './table-catalog'
import { activeDeleteTableAtom, tableRequestIdBackingAtom } from './table-command-lanes'
import {
  lastDeletedTableNameBackingAtom,
  setDiagnostic,
  tableDiagnosticBackingAtom,
} from './table-feedback'
import {
  captureTableHistoryEntryRecorder,
  recordTableHistory,
} from './table-history'
import {
  operationRejectionMessage,
  TABLE_DELETE_CAPABILITY_ERROR,
  TABLE_DELETE_REJECTION_MESSAGES,
  TABLE_HISTORY_SKEW_MESSAGE,
  TABLE_MISSING_TARGET_ERROR,
} from './table-messages'
import { errorMessage, nextRequestId, readDeleteTablePort } from './table-port-access'
import type { TableMutationRejectionCode, TableMutationResult, TablesControllerPort } from './types'

export interface RunDeleteTableInput {
  readonly source: TablesControllerPort
  /** Host capability guard captured before the backend mutation starts. */
  readonly historyEntryRecorder: HistoryEntryRecorder
  /** Canonical name of the table definition to drop. */
  readonly name: string
  readonly sheetId?: string
  readonly refreshProjection?: (sheetId?: string) => Promise<unknown> | unknown
}

/**
 * Delete a table definition through `deleteTable`. Capability-gated; an
 * empty target is rejected locally. Deleting drops the definition only —
 * the cells stay — so the catalog refresh on apply is what removes the
 * entry from every table list. A structured reject (`not-found` /
 * `mutation-during-custom-call` / …) maps to a readable diagnostic.
 */
export const runDeleteTableAtom = atom(
  null,
  async (get, set, input: RunDeleteTableInput): Promise<void> => {
    if (get(activeDeleteTableAtom)) return

    const port = readDeleteTablePort(input.source)
    set(deleteTableCapabilityBackingAtom, port !== undefined)
    if (port === undefined) {
      setDiagnostic(set, 'capability', TABLE_DELETE_CAPABILITY_ERROR)
      return
    }

    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (name.length === 0) {
      setDiagnostic(set, 'invalid-payload', TABLE_MISSING_TARGET_ERROR)
      return
    }

    const historyEntryRecorder = captureTableHistoryEntryRecorder(input)
    if (historyEntryRecorder === null) {
      setDiagnostic(set, 'invalid-payload', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }

    const requestId = nextRequestId(get(tableRequestIdBackingAtom))
    set(tableRequestIdBackingAtom, requestId)
    set(activeDeleteTableAtom, true)
    set(tableDiagnosticBackingAtom, null)

    let result: TableMutationResult
    try {
      result = await port.call(input.source, { kind: 'delete-table', name, requestId })
    } catch (error) {
      set(activeDeleteTableAtom, false)
      setDiagnostic(set, 'outcome-unknown', `Delete result is unknown: ${errorMessage(error)}`)
      return
    }

    if (!result || result.applied === false) {
      const code: TableMutationRejectionCode = result ? result.code : 'invalid-payload'
      set(activeDeleteTableAtom, false)
      setDiagnostic(
        set,
        code,
        operationRejectionMessage(TABLE_DELETE_REJECTION_MESSAGES, code, result?.message),
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
      set(activeDeleteTableAtom, false)
      setDiagnostic(set, 'outcome-unknown', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }
    set(lastDeletedTableNameBackingAtom, result.name || name)
    await set(refreshTableCatalogAtom, input.source)
    if (typeof input.refreshProjection === 'function') {
      try {
        await input.refreshProjection(input.sheetId)
      } catch {
        // Projection refresh failure is non-fatal; the definition is gone.
      }
    }
    set(activeDeleteTableAtom, false)
    set(tableDiagnosticBackingAtom, null)
  },
)
runDeleteTableAtom.debugLabel = 'spreadsheet.tables.runDelete'
