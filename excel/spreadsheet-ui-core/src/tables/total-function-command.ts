import { atom } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import { refreshTableCatalogAtom } from './table-catalog'
import { tableRequestIdBackingAtom } from './table-command-lanes'
import { setDiagnostic, tableDiagnosticBackingAtom } from './table-feedback'
import {
  captureTableHistoryEntryRecorder,
  recordTableHistory,
} from './table-history'
import {
  TABLE_HISTORY_SKEW_MESSAGE,
  TABLE_TOTALS_CAPABILITY_ERROR,
  tableRejectionMessage,
} from './table-messages'
import { errorMessage, nextRequestId, readSetTotalFunctionPort } from './table-port-access'
import type {
  TableMutationRejectionCode,
  TableMutationResult,
  TableTotalsFunction,
  TablesControllerPort,
} from './types'

export interface RunSetTableTotalFunctionInput {
  readonly source: TablesControllerPort
  /** Host capability guard captured before the backend mutation starts. */
  readonly historyEntryRecorder: HistoryEntryRecorder
  readonly name: string
  readonly column: string
  readonly func: TableTotalsFunction
  readonly sheetId?: string
  readonly refreshProjection?: (sheetId?: string) => Promise<unknown> | unknown
}

/**
 * Set one totals-row column's aggregate through `setTableTotalFunction`.
 * Capability-gated (reuses the totals port witness). On apply the catalog is
 * refreshed and the projection optionally re-read; a structured reject
 * (`no-totals-row` / `invalid-totals-function` / `column-not-found` / …)
 * maps to a user-readable diagnostic.
 */
export const runSetTableTotalFunctionAtom = atom(
  null,
  async (get, set, input: RunSetTableTotalFunctionInput): Promise<void> => {
    const port = readSetTotalFunctionPort(input.source)
    if (port === undefined) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({ code: 'capability', message: TABLE_TOTALS_CAPABILITY_ERROR }),
      )
      return
    }

    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const column = typeof input.column === 'string' ? input.column.trim() : ''
    if (name.length === 0 || column.length === 0) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({
          code: 'invalid-payload',
          message: tableRejectionMessage('invalid-payload'),
        }),
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
    set(tableDiagnosticBackingAtom, null)

    let result: TableMutationResult
    try {
      result = await port.call(input.source, {
        kind: 'set-table-total-function',
        name,
        column,
        func: input.func,
        requestId,
      })
    } catch (error) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({
          code: 'outcome-unknown',
          message: `Totals function result is unknown: ${errorMessage(error)}`,
        }),
      )
      return
    }

    if (!result || result.applied === false) {
      const code: TableMutationRejectionCode = result ? result.code : 'invalid-payload'
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({ code, message: tableRejectionMessage(code, result?.message) }),
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
        // Projection refresh failure is non-fatal; the totals write landed.
      }
    }
    set(tableDiagnosticBackingAtom, null)
  },
)
runSetTableTotalFunctionAtom.debugLabel = 'spreadsheet.tables.runSetTotalFunction'
