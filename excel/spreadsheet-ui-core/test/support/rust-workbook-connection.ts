import type { Store } from '@einfach/core'
import {
  setRustWorkbookConnectionAtom,
  type BackendMutationResult,
  type EditingCommitRequest,
  type RustSetRangeFormatResult,
  type RustClearRangeRequest,
  type RustClipboardCapture,
  type RustClipboardExport,
  type RustClipboardExportRequest,
  type RustClipboardCaptureRequest,
  type RustClipboardPasteRequest,
  type RustWorkbookConnection,
  type SetFormatRangeRequest,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../../src'

export interface TestRustWorkbookHandlers {
  exportClipboard?: (request: RustClipboardExportRequest) => Promise<RustClipboardExport>
  captureClipboard?: (request: RustClipboardCaptureRequest) => Promise<RustClipboardCapture>
  pasteClipboard?: (
    request: RustClipboardPasteRequest,
    projection: VisibleProjectionRequest,
  ) => Promise<RustSetRangeFormatResult>
  clearRange?: (
    request: RustClearRangeRequest,
    projection: VisibleProjectionRequest,
  ) => Promise<RustSetRangeFormatResult>
  readVisibleProjection?: (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
  setCellInput?: (request: EditingCommitRequest) => Promise<BackendMutationResult>
  setCellProjection?: (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
  setRangeFormat?: (
    request: SetFormatRangeRequest,
    projection: VisibleProjectionRequest,
  ) => Promise<RustSetRangeFormatResult>
}

export function createTestRustWorkbookConnection(
  handlers: TestRustWorkbookHandlers = {},
): RustWorkbookConnection {
  const request = (async (command: string, payload: unknown) => {
    if (command === 'clipboard.export' && handlers.exportClipboard) {
      return handlers.exportClipboard(payload as RustClipboardExportRequest)
    }
    if (command === 'clipboard.capture' && handlers.captureClipboard) {
      return handlers.captureClipboard(payload as RustClipboardCaptureRequest)
    }
    if (command === 'clipboard.paste' && handlers.pasteClipboard) {
      const input = payload as {
        request: RustClipboardPasteRequest
        projection: VisibleProjectionRequest
      }
      return handlers.pasteClipboard(input.request, input.projection)
    }
    if (command === 'range.clear' && handlers.clearRange) {
      const input = payload as {
        request: RustClearRangeRequest
        projection: VisibleProjectionRequest
      }
      return handlers.clearRange(input.request, input.projection)
    }
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
    if (command === 'format.setRange' && handlers.setRangeFormat) {
      const input = payload as {
        request: SetFormatRangeRequest
        projection: VisibleProjectionRequest
      }
      return handlers.setRangeFormat(input.request, input.projection)
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
