import type { PasteSpecialKind } from './types'

export const PASTE_SPECIAL_CAPABILITY_ERROR =
  'Paste Special is unavailable because this workbook does not provide pasteRange.'
export const PASTE_SPECIAL_CONTEXT_ERROR =
  'Paste Special needs a copied range and an active target selection. ' +
  'Close the dialog, copy a range, and try again.'
export const PASTE_SPECIAL_UNSUPPORTED_KIND_ERROR =
  'Paste Special for column widths and comments is not supported by the current backend.'
export const PASTE_SPECIAL_ACKNOWLEDGEMENT_ERROR =
  'Paste Special acknowledgement did not match the active request.'
export const PASTE_SPECIAL_OUTCOME_UNKNOWN_ERROR =
  'Paste Special may have been applied, but the backend did not return a matching ' +
  'acknowledgement. To avoid a duplicate paste, this request cannot be sent again. ' +
  'Refresh or reconcile the workbook before continuing.'
export const PASTE_SPECIAL_REFRESH_ERROR_PREFIX =
  'Paste Special was acknowledged, but projection refresh failed: '
export const PASTE_SPECIAL_HISTORY_BUSY_ERROR =
  'Paste Special is blocked because another history producer owns the mutation lane.'

export const SUPPORTED_PASTE_SPECIAL_KINDS: readonly PasteSpecialKind[] = Object.freeze([
  'values',
  'formats',
  'values-and-formats',
  'all',
  'transpose',
])

export const PASTE_SPECIAL_BACKEND_KIND_ERROR_PREFIX =
  'Paste Special kind is not supported by the current backend: '

/** Structured pre-dispatch reason for a kind the active backend excluded. */
export function pasteSpecialBackendKindError(kind: PasteSpecialKind): string {
  return `${PASTE_SPECIAL_BACKEND_KIND_ERROR_PREFIX}${kind}.`
}

/**
 * Backend declarations are fail-closed. Omitted declarations retain the
 * legacy full-trust contract, while declared kinds are intersected with Core.
 */
export function normalizePasteSpecialSupportedKinds(
  declared: unknown,
): readonly PasteSpecialKind[] {
  if (!Array.isArray(declared)) return SUPPORTED_PASTE_SPECIAL_KINDS
  const declaredKinds = declared as readonly unknown[]
  return Object.freeze(SUPPORTED_PASTE_SPECIAL_KINDS.filter((kind) => declaredKinds.includes(kind)))
}

export function isPasteSpecialKindSupported(kind: PasteSpecialKind): boolean {
  return kind !== 'column-widths' && kind !== 'comments'
}
