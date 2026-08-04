import { CELL_WRITE_REJECTION_ERROR_CODE, cellWriteRejectionDetail } from './cell-write-reject'
import { postError, postResponse } from './worker-post'
import type { AutoFillReportWire, RpcErrorWire, TableRejectCode } from './worker-protocol'

const AUTO_FILL_REJECTION_ERROR_NAME = 'EinfachAutoFillRejected'
const AUTO_FILL_REJECTION_ERROR_CODE = 'AUTO_FILL_REJECTED'

/**
 * Only the wasm boundary creates this Error shape, and it does so before the
 * core mutates the workbook. Strings and plain objects deliberately do not
 * qualify: serialization failures and unrelated worker exceptions must stay
 * in the generic outcome-unknown lane at the host.
 */
function autoFillRejectionMessage(error: unknown): string | null {
  if (
    !(error instanceof Error) ||
    error.name !== AUTO_FILL_REJECTION_ERROR_NAME ||
    !Object.prototype.hasOwnProperty.call(error, 'code') ||
    (error as Error & { code?: unknown }).code !== AUTO_FILL_REJECTION_ERROR_CODE
  ) {
    return null
  }
  return error.message
}

export function dispatchAutoFill(id: number, run: () => AutoFillReportWire): void {
  let result: AutoFillReportWire
  try {
    result = run()
  } catch (error) {
    const message = autoFillRejectionMessage(error)
    if (message === null) throw error
    postError(id, {
      code: AUTO_FILL_REJECTION_ERROR_CODE,
      message,
    })
    return
  }
  // Keep response serialization / transport outside the semantic-rejection
  // catch. A failing post means the host cannot know whether the core commit
  // happened and must never receive AUTO_FILL_REJECTED.
  postResponse(id, result)
}

/**
 * Run a single-cell write and post its response, converting the engine's
 * structured refusal into a `CELL_WRITE_REJECTED` error whose `detail` is
 * a `CellWriteRejectWire` (mirrors `dispatchTable` / the `sortRange`
 * convention). Anything else rethrows to the outer dispatcher, which
 * posts one generic error — no double-post because this path posted
 * nothing.
 */
export function dispatchCellWrite(id: number, run: () => unknown): void {
  let result: unknown
  try {
    result = run()
  } catch (err) {
    const detail = cellWriteRejectionDetail(err)
    if (detail === null) throw err
    postError(id, {
      code: CELL_WRITE_REJECTION_ERROR_CODE,
      message: (err as Error).message,
      detail,
    })
    return
  }
  postResponse(id, result)
}

// Excel Table CRUD (#32). The WASM `create_table` / `rename_table` / …
// bindings map every `TableError` to `JsValue::from_str(<code>)`, which
// wasm-bindgen throws as a bare JS string. Recognize the known set and
// surface it as a structured `TABLE_REJECTED` RPC error (detail.code =
// the engine reason) so the host adapter converts it into a not-applied
// result instead of a generic WORKER_ERROR — mirrors `SORT_REJECTED`.
const TABLE_REJECTION_CODES = new Set<TableRejectCode>([
  'too-many-tables',
  'invalid-name',
  'reserved-name',
  'name-like-cell-ref',
  'name-conflict',
  'range-overlap',
  'sheet-not-found',
  'not-found',
  'column-not-found',
  'duplicate-column',
  'invalid-column-name',
  'mutation-during-custom-call',
  'totals-row-blocked',
  'no-totals-row',
  'invalid-totals-function',
  // #25 `restoreTables` envelope gates — same bare-string throw shape.
  'unsupported-snapshot-version',
  'malformed-snapshot',
])

function tableRejectionCode(err: unknown): TableRejectCode | null {
  const message = typeof err === 'string' ? err : err instanceof Error ? err.message : ''
  return TABLE_REJECTION_CODES.has(message as TableRejectCode) ? (message as TableRejectCode) : null
}

/**
 * Run a table binding and post its response, converting a recognized
 * `TableError` throw into a structured `TABLE_REJECTED` error. Non-table
 * throws (invalid sheet, missing method, serialize failure) rethrow to
 * the outer dispatcher, which posts a single generic error — no
 * double-post because this path posted nothing.
 */
export function dispatchTable(id: number, run: () => unknown): void {
  let result: unknown
  try {
    result = run()
  } catch (err) {
    const code = tableRejectionCode(err)
    if (code === null) throw err
    postError(id, { code: 'TABLE_REJECTED', message: code, detail: { code } })
    return
  }
  postResponse(id, result)
}

export function toRpcError(err: unknown): RpcErrorWire {
  if (err instanceof Error) {
    const claimedCode = String((err as Error & { code?: string }).code ?? 'WORKER_ERROR')
    return {
      // AUTO_FILL_REJECTED and CELL_WRITE_REJECTED are private typed
      // boundaries, not generally claimable Error.codes. Their dispatchers
      // emit them only after checking the complete native Error witness;
      // anything reaching this generic path (including a spoofed partial
      // witness) stays generic.
      code:
        claimedCode === AUTO_FILL_REJECTION_ERROR_CODE ||
        claimedCode === CELL_WRITE_REJECTION_ERROR_CODE
          ? 'WORKER_ERROR'
          : claimedCode,
      message: err.message,
    }
  }
  return { code: 'WORKER_ERROR', message: String(err) }
}
