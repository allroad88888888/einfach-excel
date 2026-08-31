import type { RequestMessage } from './runtime-errors'
import { rpcError } from './runtime-errors'
import type { RuntimeState } from './runtime-state'
import type { SheetLifecycle } from './sheet-lifecycle'
import type { PersistenceServices } from './persistence'

export type CommandResult = { handled: true; value: unknown } | { handled: false }

export interface RuntimeCommandContext {
  state: RuntimeState
  lifecycle: SheetLifecycle
  persistence: PersistenceServices
}

export type RuntimeCommandHandler = (
  msg: RequestMessage,
  context: RuntimeCommandContext,
) => CommandResult

export function handled(value: unknown): CommandResult {
  return { handled: true, value }
}

export function unhandled(): CommandResult {
  return { handled: false }
}

export function createRuntimeDispatch(handlers: readonly RuntimeCommandHandler[]) {
  return async (msg: RequestMessage, context: RuntimeCommandContext): Promise<unknown> => {
    for (const handler of handlers) {
      const result = handler(msg, context)
      if (result.handled) return result.value
    }
    throw rpcError('UNKNOWN_COMMAND', `unknown command: ${String(msg.cmd)}`)
  }
}
