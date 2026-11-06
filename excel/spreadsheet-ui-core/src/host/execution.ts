import { atom } from '@einfach/core'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { projectionSnapshotAtom } from '../projection/state'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import { drawingSuspensionAtom, workbookDrawingSuspendedAtom } from './drawing-state'
import { publishWorkbookOperationAtom } from './operation-publication'
import { hostCommandError } from './errors'
import type { HostCommandFailure, HostCommandError, HostCommands } from './types'

export const suspendWorkbookDrawAtom = atom(
  null,
  (get, set): { status: 'ok'; depth: number } | HostCommandFailure => {
    try {
      if (!get(rustWorkbookConnectionAtom)) throw new Error('WORKBOOK_NOT_READY')
      if (get(editingSessionAtom).source || get(activeEditingCommitTicketAtom))
        throw new Error('HOST_EDITING_ACTIVE')
      const state = get(drawingSuspensionAtom)
      const depth = (state?.depth ?? 0) + 1
      if (!Number.isSafeInteger(depth)) throw new Error('DRAW_PAUSE_LIMIT')
      set(drawingSuspensionAtom, {
        depth,
        snapshot: state?.snapshot ?? get(projectionSnapshotAtom),
      })
      return { status: 'ok', depth }
    } catch (error) {
      return { status: 'error', error: hostCommandError(error) }
    }
  },
)

export const refreshWorkbookAtom = atom(
  null,
  async (get, set): Promise<{ status: 'ok'; deferred: boolean } | HostCommandFailure> => {
    try {
      if (get(workbookDrawingSuspendedAtom)) return { status: 'ok', deferred: true }
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection) throw new Error('WORKBOOK_NOT_READY')
      const result = await connection.request('host.refresh', {})
      if (get(rustWorkbookConnectionAtom) !== connection)
        throw new Error('WORKBOOK_CONNECTION_REPLACED')
      if (get(workbookDrawingSuspendedAtom)) return { status: 'ok', deferred: true }
      await set(publishWorkbookOperationAtom, { ...result, refresh: true })
      return { status: 'ok', deferred: false }
    } catch (error) {
      return { status: 'error', error: hostCommandError(error) }
    }
  },
)

export const resumeWorkbookDrawAtom = atom(
  null,
  async (get, set): Promise<{ status: 'ok'; depth: number } | HostCommandFailure> => {
    const state = get(drawingSuspensionAtom)
    if (!state) return { status: 'ok', depth: 0 }
    if (state.depth > 1) {
      set(drawingSuspensionAtom, { ...state, depth: state.depth - 1 })
      return { status: 'ok', depth: state.depth - 1 }
    }
    try {
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection) throw new Error('WORKBOOK_NOT_READY')
      const result = await connection.request('host.refresh', {})
      if (get(rustWorkbookConnectionAtom) !== connection)
        throw new Error('WORKBOOK_CONNECTION_REPLACED')
      // Concurrent suspend/resume calls cannot release someone else's new suspension.
      if (get(drawingSuspensionAtom) !== state) throw new Error('DRAW_PAUSE_CHANGED')
      set(drawingSuspensionAtom, null)
      await set(publishWorkbookOperationAtom, { ...result, refresh: true })
      return { status: 'ok', depth: 0 }
    } catch (error) {
      return { status: 'error', error: hostCommandError(error) }
    }
  },
)

export const controlWorkbookCalculationAtom = atom(
  null,
  async (
    get,
    set,
    input: HostCommands['host.calculation']['payload'],
  ): Promise<
    | HostCommandFailure
    | ({
        status: 'ok'
        displayError?: HostCommandError
      } & HostCommands['host.calculation']['result'])
  > => {
    try {
      const connection = get(rustWorkbookConnectionAtom)
      if (!connection) throw new Error('WORKBOOK_NOT_READY')
      const result = await connection.request('host.calculation', input)
      if (get(rustWorkbookConnectionAtom) !== connection)
        throw new Error('WORKBOOK_CONNECTION_REPLACED')
      if (input.action !== 'suspend' && result.depth === 0) {
        const refreshed = await set(refreshWorkbookAtom)
        if (refreshed.status === 'error')
          return { status: 'ok', ...result, displayError: refreshed.error }
      }
      return { status: 'ok', ...result }
    } catch (error) {
      return { status: 'error', error: hostCommandError(error) }
    }
  },
)
suspendWorkbookDrawAtom.debugLabel = 'spreadsheet.host.suspendDraw'
resumeWorkbookDrawAtom.debugLabel = 'spreadsheet.host.resumeDraw'
refreshWorkbookAtom.debugLabel = 'spreadsheet.host.refresh'
controlWorkbookCalculationAtom.debugLabel = 'spreadsheet.host.calculation'
