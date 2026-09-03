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
  readVisibleProjection?: (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
  setCellInput?: (request: EditingCommitRequest) => Promise<BackendMutationResult>
  setCellProjection?: (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
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
      const input = payload as {
        request: EditingCommitRequest
        projection: VisibleProjectionRequest
      }
      const acknowledgement = await handlers.setCellInput(input.request)
      let projection: VisibleProjectionResult
      try {
        projection = handlers.setCellProjection
          ? await handlers.setCellProjection(input.projection)
          : handlers.readVisibleProjection
            ? await handlers.readVisibleProjection(input.projection)
            : {
                kind: 'visible-window' as const,
                sheetId: input.projection.sheetId,
                requestId: input.projection.requestId,
                window: { ...input.projection.window },
                cells: [],
              }
      } catch {
        projection = {
          kind: 'visible-window',
          sheetId: input.projection.sheetId,
          requestId: input.projection.requestId + 1,
          window: { ...input.projection.window },
          cells: [],
        }
      }
      return { acknowledgement, projection }
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
