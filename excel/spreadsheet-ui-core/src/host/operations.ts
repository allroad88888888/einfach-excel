import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { hostCommandError } from './errors'
import { workbookDrawingSuspendedAtom } from './drawing-state'
import { publishWorkbookOperationAtom } from './operation-publication'
import type {
  WorkbookOperation,
  WorkbookOperationResult,
  NativeWorkbookOperationResult,
} from './operation-types'

/** Explicit-target API writes share native history and never replace the user's selection. */
export const executeWorkbookOperationAtom = atom(
  null,
  async (get, set, input: WorkbookOperation): Promise<WorkbookOperationResult> => {
    let committed: NativeWorkbookOperationResult | undefined
    try {
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection) throw new Error('The workbook is not ready.')
      if (get(editingSessionAtom).source || get(activeEditingCommitTicketAtom))
        throw new Error('HOST_EDITING_ACTIVE')
      const result = await connection.request('host.execute', input)
      if (get(rustWorkbookConnectionAtom) !== connection)
        throw new Error('WORKBOOK_CONNECTION_REPLACED')
      committed = result
      if (!get(workbookDrawingSuspendedAtom)) await set(publishWorkbookOperationAtom, result)
      return { status: 'ok', ...result }
    } catch (error) {
      return committed
        ? { status: 'ok', ...committed, displayError: hostCommandError(error) }
        : { status: 'error', error: hostCommandError(error, true) }
    }
  },
)
executeWorkbookOperationAtom.debugLabel = 'spreadsheet.host.executeOperation'
