import type { RustWorkbookCommands, RustWorkbookConnection } from '../rust-workbook/commands'
import type { WorkerLike } from '../rust-worker/types'
import { createWorkerTransport } from '../rust-worker/transport'
import { assertHostCommandAllowed, DEFAULT_HOST_CONTROLS, validateHostControls } from './policy'
import { assertHostOperationAllowed } from './policy'
import type { WorkbookOperation } from './operation-types'
import { immutableCommandPayload, type WorkbookHooks } from './hooks'
import { isPersistentHostCommand } from './policy'

let nextConnectionId = 1
const identities = new WeakMap<object, string>()
export function workbookConnectionId(connection: object): string {
  let identity = identities.get(connection)
  if (!identity) { identity = `workbook-${nextConnectionId++}`; identities.set(connection, identity) }
  return identity
}

/** 每条公开请求先过相同权限门；Worker 会再次检查，不能依赖 UI 是否禁用。 */
export function createHostWorkbookConnection(
  workerFactory: () => WorkerLike, beforeChange?: WorkbookHooks['beforeChange']): RustWorkbookConnection {
  const transport = createWorkerTransport<RustWorkbookCommands>(workerFactory)
  let controls = DEFAULT_HOST_CONTROLS
  let initialized = false
  let runningHook = false
  return {
    request(command, payload) {
      try {
        if (initialized && ['workbook.initialize', 'workbook.openFile', 'workbook.importCells'].includes(command))
          throw new Error('HOST_LIFECYCLE_CLOSED')
        if (command === 'host.configure') {
          controls = validateHostControls(payload as typeof controls)
          initialized = true
        }
        assertHostCommandAllowed(controls, command)
        if (command === 'host.execute') assertHostOperationAllowed(controls, payload as WorkbookOperation)
        if (beforeChange && isPersistentHostCommand(command)) {
          if (runningHook) throw new Error('HOST_HOOK_REENTRANT')
          runningHook = true
          try {
            const approved = beforeChange(Object.freeze({ command,
              source: command.startsWith('host.') ? 'api'
                : command === 'history.apply' ? 'history' : 'user',
              payload: immutableCommandPayload(payload) }))
            if (approved !== undefined && typeof approved !== 'boolean')
              throw new Error('HOST_HOOK_MUST_BE_SYNCHRONOUS')
            if (approved === false) throw new Error('HOST_COMMAND_CANCELLED')
          } finally { runningHook = false }
        }
        return transport.request(command, payload)
      } catch (error) { return Promise.reject(error) }
    },
    subscribe: (listener) => transport.subscribe!(listener),
    dispose: () => transport.dispose(),
  }
}
