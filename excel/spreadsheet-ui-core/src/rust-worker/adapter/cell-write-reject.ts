/**
 * Structured refusal of a SINGLE-CELL write, and the fail-closed
 * translation from the engine's fallible `try*` bindings onto the RPC
 * boundary.
 *
 * Why this exists: the WASM workbook exposes two families of cell
 * setters. The infallible `set_cell_number` / `set_cell_text` /
 * `set_cell_boolean` / `set_cell_error` / `clearCellAt` / `setFormulaAt`
 * family DISCARDS the engine's `SheetError`s, so a refused write returned
 * a success-shaped ACK while the engine kept the old value — the user's
 * keystrokes vanished and the host was told the mutation applied. That is
 * the same success-shaped fake ACK the TS runtime's structural no-op used
 * to hand out (see `worker-runtime-ts.ts` `unsupported`). The fallible
 * `trySetCell*` / `tryClearCellAt` / `trySetFormulaAt` twins return the
 * refusal instead, and the worker dispatcher only ever calls those.
 *
 * Scope: this module makes the refusal VISIBLE. It does not decide which
 * writes the engine refuses — spill-range writes, for one, are no longer
 * among them (ADR 0006: the write lands and the array is withdrawn).
 */

/**
 * Engine refusal reason for a single-cell write, as produced by
 * `sheet_error_to_js` on the WASM side. `invalid-address` is an
 * unparseable A1 addr (the infallible twins silently no-op on those), and
 * `mutation-during-custom-call` a write attempted from inside a
 * custom-formula callback.
 *
 * A third reason, `spill-write` (with an `anchor`), was retired by ADR
 * 0006: `SheetError::SpillCellWrite` is no longer constructed, so the code
 * can no longer reach this boundary. Should an older wasm artifact still
 * emit it, `cellWriteReject` reads it as an unrecognized reason and
 * reports `invalid-address` — less precise, still fail-closed.
 */
export type CellWriteRejectCode = 'invalid-address' | 'mutation-during-custom-call'

/**
 * Rides on a `CELL_WRITE_REJECTED` RPC error's `detail` (see
 * `RpcErrorWire.detail`) rather than the flat `code`/`message` pair —
 * same convention as `SORT_REJECTED` / `TABLE_REJECTED`, which use the
 * extra room for an `anchor`.
 */
export interface CellWriteRejectWire {
  code: CellWriteRejectCode
}

/** Resolved value of `trySetCell*` / `tryClearCellAt`. */
export type CellWriteOutcomeWire = { ok: true } | ({ ok: false } & CellWriteRejectWire)

/**
 * Resolved value of `trySetFormulaAt`. `installed: false` is NOT a
 * refusal — the source failed to parse or cycled and the cell already
 * holds `#VALUE!` / `#CYCLE!`, which the caller reports through
 * `FormulaMutationResultWire`.
 */
export type FormulaWriteOutcomeWire =
  | { ok: true; installed: boolean }
  | ({ ok: false } & CellWriteRejectWire)

export const CELL_WRITE_REJECTION_ERROR_CODE = 'CELL_WRITE_REJECTED'
const CELL_WRITE_REJECTION_ERROR_NAME = 'EinfachCellWriteRejected'

const CELL_WRITE_REJECT_CODES = new Set<CellWriteRejectCode>([
  'invalid-address',
  'mutation-during-custom-call',
])

function rejectCode(value: unknown): CellWriteRejectCode | null {
  return CELL_WRITE_REJECT_CODES.has(value as CellWriteRejectCode)
    ? (value as CellWriteRejectCode)
    : null
}

function rejectMessage(addr: string, reject: CellWriteRejectWire): string {
  switch (reject.code) {
    case 'invalid-address':
      return `cannot write ${addr}: not a valid cell address`
    case 'mutation-during-custom-call':
      return `cannot write ${addr}: mutations are forbidden inside a custom-formula callback`
  }
}

/**
 * Read the refusal out of a raw `try*` outcome. A non-object, a missing
 * `ok`, or an `ok !== false` outcome is a successful write; an
 * `ok === false` carrying an unrecognized `code` still counts as a
 * refusal (reported as `invalid-address`, the most conservative reading)
 * so a newer engine reason can never read back as success.
 */
export function cellWriteReject(outcome: unknown): CellWriteRejectWire | null {
  if (typeof outcome !== 'object' || outcome === null) return null
  const candidate = outcome as { ok?: unknown; code?: unknown }
  if (candidate.ok !== false) return null
  return { code: rejectCode(candidate.code) ?? 'invalid-address' }
}

/**
 * Private typed witness, mirroring the AutoFill rejection boundary: only
 * this module mints it, and only `dispatchCellWrite` may turn it into a
 * `CELL_WRITE_REJECTED` RPC error. Strings, plain objects, and partial
 * Errors deliberately do not qualify — an unrelated worker exception must
 * stay in the generic `WORKER_ERROR` lane.
 */
function cellWriteRejectionError(addr: string, reject: CellWriteRejectWire): Error {
  return Object.assign(new Error(rejectMessage(addr, reject)), {
    name: CELL_WRITE_REJECTION_ERROR_NAME,
    code: CELL_WRITE_REJECTION_ERROR_CODE,
    detail: reject,
  })
}

/** Recover the refusal detail from a thrown value, or `null` if it is not one. */
export function cellWriteRejectionDetail(error: unknown): CellWriteRejectWire | null {
  if (
    !(error instanceof Error) ||
    error.name !== CELL_WRITE_REJECTION_ERROR_NAME ||
    !Object.prototype.hasOwnProperty.call(error, 'code') ||
    (error as Error & { code?: unknown }).code !== CELL_WRITE_REJECTION_ERROR_CODE
  ) {
    return null
  }
  const detail = (error as Error & { detail?: unknown }).detail
  if (typeof detail !== 'object' || detail === null) return null
  const code = rejectCode((detail as { code?: unknown }).code)
  return code === null ? null : { code }
}

/** Throw the typed witness when a `trySetCell*` / `tryClearCellAt` outcome refused. */
export function assertCellWriteOk(outcome: unknown, addr: string): void {
  const reject = cellWriteReject(outcome)
  if (reject !== null) throw cellWriteRejectionError(addr, reject)
}

/**
 * Throw the typed witness when a `trySetFormulaAt` outcome refused;
 * otherwise report whether the formula actually installed.
 */
export function assertFormulaWriteInstalled(outcome: unknown, addr: string): boolean {
  assertCellWriteOk(outcome, addr)
  return (outcome as { installed?: unknown } | null)?.installed !== false
}
