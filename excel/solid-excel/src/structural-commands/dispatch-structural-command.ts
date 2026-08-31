import type { Store } from '@einfach/core'
import type { SpreadsheetBackend, SpreadsheetOperationSource } from '@einfach/spreadsheet-ui-core'
import { refreshVisibleProjection } from '../provider/projection-refresh'

export interface DispatchStructuralCommandInput<Command extends string = string> {
  readonly command: Command
  readonly timeoutMs?: number
  readonly operationSource?: SpreadsheetOperationSource
}

/** The host dependencies supplied to a UI-core structural command Atom. */
export interface StructuralCommandDispatchContext<Command extends string = string>
  extends DispatchStructuralCommandInput<Command> {
  readonly source: SpreadsheetBackend
  readonly refreshProjection: (sheetId: string) => Promise<void>
}

/**
 * Supplies host ports to a structural command Atom without importing a private
 * UI-core source module or retaining the backend outside one dispatch.
 */
export function dispatchStructuralCommand<Command extends string, Result>(
  store: Store,
  backend: SpreadsheetBackend,
  input: DispatchStructuralCommandInput<Command>,
  run: (context: StructuralCommandDispatchContext<Command>) => Result,
): Result {
  return run({
    ...input,
    source: backend,
    refreshProjection: (sheetId: string) =>
      refreshVisibleProjection(store, backend, sheetId, 'selection'),
  })
}
