import type {
  BackendMutationResult,
  EditingCommitRequest,
  RustWorkbookConnection,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'

export interface TestRustWorkbookHandlers {
  onRequest?: (command: string) => void
  readVisibleProjection?: (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
  setCellInput?: (request: EditingCommitRequest) => Promise<BackendMutationResult>
  setCellProjection?: (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
}

/** 把测试关注的两条命令装进最小 Rust connection 假件。 */
export function createTestRustWorkbookConnection(
  handlers: TestRustWorkbookHandlers = {},
): RustWorkbookConnection {
  const request = (async (command: string, payload: unknown) => {
    handlers.onRequest?.(command)
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
