import { NAMED_RANGE_MUTATION_LEDGER_MAX } from './constants'
import { copyRefersTo, copyScope } from './snapshots'
import { normalizeNamedRangeName } from './types'
import type {
  DeleteNamedRangeRequest,
  NamedRangeBackendCapabilities,
  NamedRangeBindingKind,
  NamedRangeMutationPayload,
  NamedRangeMutationState,
  NamedRangeOperationAttempt,
  NamedRangeScope,
  SetNamedRangeRequest,
} from './types'

export function freezeAttempt(attempt: NamedRangeOperationAttempt): NamedRangeOperationAttempt {
  return Object.freeze({ ...attempt, scope: copyScope(attempt.scope) ?? 'workbook' })
}

export function freezeLedger(
  attempts: readonly NamedRangeOperationAttempt[],
): readonly NamedRangeOperationAttempt[] {
  return Object.freeze(attempts.slice())
}

export function findOldestTerminal(attempts: readonly NamedRangeOperationAttempt[]): number {
  return attempts.findIndex(
    (attempt) => attempt.status === 'acknowledged' || attempt.status === 'confirmed-not-applied',
  )
}

export function reserveAttemptSlot(
  attempts: readonly NamedRangeOperationAttempt[],
): readonly NamedRangeOperationAttempt[] | null {
  if (attempts.length < NAMED_RANGE_MUTATION_LEDGER_MAX) return attempts
  const terminalIndex = findOldestTerminal(attempts)
  return terminalIndex < 0
    ? null
    : Object.freeze([...attempts.slice(0, terminalIndex), ...attempts.slice(terminalIndex + 1)])
}

export function supportsMutation(
  capabilities: NamedRangeBackendCapabilities,
  mutation: NamedRangeMutationPayload,
): boolean {
  const scopeKind = mutation.scope === 'workbook' ? 'workbook' : 'sheet'
  if (!capabilities.scopes.includes(scopeKind)) return false
  if (mutation.action === 'delete') return capabilities.delete
  return (
    capabilities.bindings[mutation.refersTo.kind] &&
    (mutation.refersTo.kind !== 'range' || capabilities.rangeSemantics !== 'unsupported')
  )
}

export function copyMutation(
  mutation: NamedRangeMutationPayload,
  requestId: number,
): {
  readonly name: string
  readonly scope: NamedRangeScope
  readonly bindingKind?: NamedRangeBindingKind
  readonly request: Readonly<SetNamedRangeRequest | DeleteNamedRangeRequest>
} | null {
  if (typeof mutation !== 'object' || mutation === null) return null
  const name = typeof mutation.name === 'string' ? normalizeNamedRangeName(mutation.name) : null
  const scope = copyScope(mutation.scope)
  if (name === null || scope === null) return null
  if (mutation.action === 'delete') {
    return Object.freeze({
      name,
      scope,
      request: Object.freeze({ kind: 'delete-named-range', name, scope, requestId }),
    })
  }
  if (mutation.action !== 'set') return null
  const refersTo = copyRefersTo(mutation.refersTo)
  if (refersTo === null) return null
  return Object.freeze({
    name,
    scope,
    bindingKind: refersTo.kind,
    request: Object.freeze({ kind: 'set-named-range', name, scope, refersTo, requestId }),
  })
}

export function blockedMutationState(error: string): NamedRangeMutationState {
  return Object.freeze({
    status: 'blocked',
    operationId: null,
    requestId: null,
    origin: null,
    sessionId: null,
    action: null,
    outcome: null,
    error,
  })
}
