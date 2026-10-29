import type { GoToErrorDetails, GoToLocator } from './types'

export function snapshotLocator(locator: GoToLocator): GoToLocator {
  if (locator.kind === 'formulas' || locator.kind === 'constants') {
    return Object.freeze({ kind: locator.kind, valueKind: locator.valueKind })
  }
  return Object.freeze({ kind: locator.kind }) as GoToLocator
}

export function sameLocator(left: GoToLocator, right: GoToLocator): boolean {
  if (left.kind !== right.kind) return false
  if (
    (left.kind === 'formulas' || left.kind === 'constants') &&
    (right.kind === 'formulas' || right.kind === 'constants')
  ) {
    return left.valueKind === right.valueKind
  }
  return true
}

export function snapshotError(details: GoToErrorDetails): GoToErrorDetails {
  return Object.freeze({
    code: details.code,
    params: details.params === null ? null : Object.freeze({ ...details.params }),
    message: details.message,
  })
}

export function explicitSpecialError(code: string, message: string): GoToErrorDetails {
  return Object.freeze({ code, params: null, message })
}

export function unavailableSpecialError(): GoToErrorDetails {
  return explicitSpecialError(
    'goTo.error.capabilityUnavailable',
    'Go To Special is unavailable because range projection is not supported.',
  )
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
