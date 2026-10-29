import { atom } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import type { CellCoord } from '../shared'
import { toggleTotalsCapabilityBackingAtom } from './table-capabilities'
import { refreshTableCatalogAtom, tableCatalogBackingAtom } from './table-catalog'
import { activeToggleTotalsAtom, tableRequestIdBackingAtom } from './table-command-lanes'
import {
  lastToggledTableTotalsBackingAtom,
  setDiagnostic,
  tableDiagnosticBackingAtom,
} from './table-feedback'
import { findTableForCell } from './table-geometry'
import {
  captureTableHistoryEntryRecorder,
  recordTableHistory,
} from './table-history'
import {
  TABLE_HISTORY_SKEW_MESSAGE,
  TABLE_NO_TABLE_AT_SELECTION_ERROR,
  TABLE_TOTALS_CAPABILITY_ERROR,
  tableRejectionMessage,
} from './table-messages'
import { errorMessage, nextRequestId, readSetTotalsRowPort } from './table-port-access'
import type { TableMutationRejectionCode, TableMutationResult, TablesControllerPort } from './types'

// --- totals row (design §7, parity #32 T6) ---------------------------------

export interface RunToggleTableTotalsInput {
  readonly source: TablesControllerPort
  /** Host capability guard captured before the backend mutation starts. */
  readonly historyEntryRecorder: HistoryEntryRecorder
  /** Canonical table name to toggle. */
  readonly name: string
  /** Target state: `true` grows a totals row, `false` removes it. */
  readonly enabled: boolean
  /** Sheet id passed to `refreshProjection` after the totals cells land. */
  readonly sheetId?: string
  /** Optional post-apply projection refresh (the SUBTOTAL write is a new cell). */
  readonly refreshProjection?: (sheetId?: string) => Promise<unknown> | unknown
}

/**
 * Toggle a named table's totals row through `setTableTotalsRow`.
 * Capability-gated: when the host omits the port the command surfaces a
 * capability diagnostic and never touches the engine. On an applied result
 * the bounded catalog is refreshed (so the descriptor's `hasTotals` and
 * grown range become canonical) and a visible witness is published; a
 * structured reject (`totals-row-blocked` / `not-found` / …) maps to a
 * user-readable diagnostic without a thrown promise.
 */
export const runToggleTableTotalsAtom = atom(
  null,
  async (get, set, input: RunToggleTableTotalsInput): Promise<void> => {
    if (get(activeToggleTotalsAtom)) return

    const port = readSetTotalsRowPort(input.source)
    set(toggleTotalsCapabilityBackingAtom, port !== undefined)
    if (port === undefined) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({ code: 'capability', message: TABLE_TOTALS_CAPABILITY_ERROR }),
      )
      return
    }

    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (name.length === 0) {
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
    set(activeToggleTotalsAtom, true)
    set(tableDiagnosticBackingAtom, null)

    let result: TableMutationResult
    try {
      result = await port.call(input.source, {
        kind: 'set-table-totals-row',
        name,
        enabled: input.enabled,
        requestId,
      })
    } catch (error) {
      set(activeToggleTotalsAtom, false)
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({
          code: 'outcome-unknown',
          message: `Totals row result is unknown: ${errorMessage(error)}`,
        }),
      )
      return
    }

    // Structured rejection: nothing was written, no catalog change.
    if (!result || result.applied === false) {
      const code: TableMutationRejectionCode = result ? result.code : 'invalid-payload'
      set(activeToggleTotalsAtom, false)
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({ code, message: tableRejectionMessage(code, result?.message) }),
      )
      return
    }

    // Applied — record before publishing a local acknowledgement or refreshing
    // the bounded cache. A rejected recorder leaves the mutation outcome unknown.
    const historyResult = recordTableHistory(
      set,
      historyEntryRecorder,
      input.sheetId ?? null,
      result.revision,
    )
    if (historyResult === 'rejected') {
      set(activeToggleTotalsAtom, false)
      setDiagnostic(set, 'outcome-unknown', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }
    set(
      lastToggledTableTotalsBackingAtom,
      Object.freeze({ name: result.name, hasTotals: input.enabled }),
    )
    await set(refreshTableCatalogAtom, input.source)
    if (typeof input.refreshProjection === 'function') {
      try {
        await input.refreshProjection(input.sheetId)
      } catch {
        // Projection refresh failure is non-fatal; the totals write landed.
      }
    }
    set(activeToggleTotalsAtom, false)
    set(tableDiagnosticBackingAtom, null)
  },
)
runToggleTableTotalsAtom.debugLabel = 'spreadsheet.tables.runToggleTotals'

export interface RunToggleTableTotalsAtSelectionInput {
  readonly source: TablesControllerPort
  readonly historyEntryRecorder: HistoryEntryRecorder
  readonly sheetId: string
  /** Active cell used to resolve the owning table. */
  readonly cell: CellCoord
  readonly refreshProjection?: (sheetId?: string) => Promise<unknown> | unknown
}

/**
 * Resolve the table containing `cell` (refreshing the catalog first so the
 * geometry is canonical) and toggle its totals row to the opposite state.
 * When the active cell is not inside any table on `sheetId`, a
 * `no-table-at-selection` diagnostic is surfaced and no engine call runs.
 * This is the selection-resolving UI entry; the explicit dispatch lives in
 * {@link runToggleTableTotalsAtom}.
 */
export const runToggleTableTotalsAtSelectionAtom = atom(
  null,
  async (get, set, input: RunToggleTableTotalsAtSelectionInput): Promise<void> => {
    const port = readSetTotalsRowPort(input.source)
    set(toggleTotalsCapabilityBackingAtom, port !== undefined)
    if (port === undefined) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({ code: 'capability', message: TABLE_TOTALS_CAPABILITY_ERROR }),
      )
      return
    }
    if (!input.sheetId) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({
          code: 'no-table-at-selection',
          message: TABLE_NO_TABLE_AT_SELECTION_ERROR,
        }),
      )
      return
    }

    const historyEntryRecorder = captureTableHistoryEntryRecorder(input)
    if (historyEntryRecorder === null) {
      setDiagnostic(set, 'invalid-payload', TABLE_HISTORY_SKEW_MESSAGE)
      return
    }

    // Refresh the catalog so geometry / hasTotals are fresh before resolving.
    await set(refreshTableCatalogAtom, input.source)
    const tables = get(tableCatalogBackingAtom).filter((table) => table.sheetId === input.sheetId)
    const target = findTableForCell(tables, input.cell)
    if (target === undefined) {
      set(
        tableDiagnosticBackingAtom,
        Object.freeze({
          code: 'no-table-at-selection',
          message: TABLE_NO_TABLE_AT_SELECTION_ERROR,
        }),
      )
      return
    }

    await set(runToggleTableTotalsAtom, {
      source: input.source,
      historyEntryRecorder,
      name: target.name,
      enabled: !target.hasTotals,
      sheetId: input.sheetId,
      refreshProjection: input.refreshProjection,
    })
  },
)
runToggleTableTotalsAtSelectionAtom.debugLabel = 'spreadsheet.tables.runToggleTotalsAtSelection'
