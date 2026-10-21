import { atom } from '@einfach/core'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rejectSpreadsheetRuntimeAtom } from '../runtime/workbook-lifecycle'
import { projectionSnapshotAtom } from '../projection/state'
import { runVisibleProjectionAtom } from '../projection/run-visible-projection'

const watchedConnectionAtom = atom<RustWorkbookConnection | null>(null)

/** The sole deferred waiter refreshes the current view without changing selection, editing or focus. */
export const watchAsyncFormulaSettlementsAtom = atom(
  null,
  (get, set, connection: RustWorkbookConnection): void => {
    if (get(watchedConnectionAtom) === connection) return
    set(watchedConnectionAtom, connection)
    void (async () => {
      try {
        // Runtime binds the connection in the same outer writer; read derived identity after flush.
        await Promise.resolve()
        while (get(rustWorkbookConnectionAtom) === connection) {
          const result = await connection.request('formula.awaitAsync', {})
          if (!result.settled || get(rustWorkbookConnectionAtom) !== connection) return
          const request = get(projectionSnapshotAtom).request
          if (request?.kind === 'visible-window' &&
            request.sheetId === get(activeWorkbookSheetAtom)?.id) {
            await set(runVisibleProjectionAtom, {
              sheetId: request.sheetId, window: request.window,
              viewport: request.viewport, reason: 'viewport',
            })
          }
        }
      } catch (error) {
        if (get(rustWorkbookConnectionAtom) === connection) {
          // A native settlement/drain failure cannot be represented as a trustworthy cell result.
          // Surface the actual runtime failure instead of leaving visible formulas permanently busy.
          set(rejectSpreadsheetRuntimeAtom, error)
          connection.dispose()
        }
      } finally {
        if (get(watchedConnectionAtom) === connection) set(watchedConnectionAtom, null)
      }
    })()
  },
)
