import type { RustWorkbookCommands, RustWorkbookConnection } from '../rust-workbook/commands'
import type { WorkerLike } from '../rust-worker/types'
import { createWorkerTransport } from '../rust-worker/transport'
import { assertHostCommandAllowed, DEFAULT_HOST_CONTROLS, validateHostControls } from './policy'

let nextConnectionId = 1
const identities = new WeakMap<object, string>()
export function workbookConnectionId(connection: object): string {
  let identity = identities.get(connection)
  if (!identity) { identity = `workbook-${nextConnectionId++}`; identities.set(connection, identity) }
  return identity
}

/** 每条公开请求先过相同权限门；Worker 会再次检查，不能依赖 UI 是否禁用。 */
export function createHostWorkbookConnection(
  workerFactory: () => WorkerLike): RustWorkbookConnection {
  const transport = createWorkerTransport<RustWorkbookCommands>(workerFactory)
  let controls = DEFAULT_HOST_CONTROLS
  let initialized = false
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
        return transport.request(command, payload)
      } catch (error) { return Promise.reject(error) }
    },
    subscribe: (listener) => transport.subscribe!(listener),
    dispose: () => transport.dispose(),
  }
}
