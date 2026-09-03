import type {
  BackendMutationResult,
  EditingCommitRequest,
  RustWorkbookConnection,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'

export interface TestRustWorkbookHandlers {
  readVisibleProjection?: (
    request: VisibleProjectionRequest,
  ) => Promise<VisibleProjectionResult>
  setCellInput?: (
    request: EditingCommitRequest,
  ) => Promise<BackendMutationResult>
}

/** 把测试关注的两条命令装进最小 Rust connection 假件。 */
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
