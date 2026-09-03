import type { Store } from '@einfach/core'
import {
  setRustWorkbookConnectionAtom,
  type BackendMutationResult,
  type EditingCommitRequest,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../../src'

export interface TestRustWorkbookHandlers {
  readVisibleProjection?: (
    request: VisibleProjectionRequest,
  ) => Promise<VisibleProjectionResult>
  setCellInput?: (
    request: EditingCommitRequest,
  ) => Promise<BackendMutationResult>
}

export function createTestRustWorkbookConnection(
  handlers: TestRustWorkbookHandlers = {},
): RustWorkbookConnection {
  const request = (async (command: string, payload: unknown) => {
    if (command === 'projection.readVisible' && handlers.readVisibleProjection) {
      return handlers.readVisibleProjection(
        (payload as { request: VisibleProjectionRequest }).request,
      )
    }
    if (command === 'cell.setInput' && handlers.setCellInput) {
      return handlers.setCellInput(
        (payload as { request: EditingCommitRequest }).request,
      )
    }
    throw new Error(`Unhandled test Rust command: ${command}`)
  }) as RustWorkbookConnection['request']
  return { request, dispose() {} }
}

export function bindTestRustWorkbookConnection(
  store: Store,
  handlers: TestRustWorkbookHandlers,
): RustWorkbookConnection {
  const connection = createTestRustWorkbookConnection(handlers)
  store.setter(setRustWorkbookConnectionAtom, connection)
  return connection
}
