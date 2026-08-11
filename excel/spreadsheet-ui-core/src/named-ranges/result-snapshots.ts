import type {
  NamedRange,
  NamedRangeBackendCapabilities,
  NamedRangeMutationResult,
  NamedRangeRegistryState,
} from './types'

export interface OptionalRevisionSnapshot {
  readonly present: boolean
  readonly value?: number | string
}

const ABSENT_REVISION_SNAPSHOT: OptionalRevisionSnapshot = Object.freeze({ present: false })

export function copyOptionalRevision(container: object): OptionalRevisionSnapshot | null {
  try {
    if (!Object.prototype.hasOwnProperty.call(container, 'revision'))
      return ABSENT_REVISION_SNAPSHOT
    const value = (container as { readonly revision?: unknown }).revision
    if (typeof value === 'string') return Object.freeze({ present: true, value })
    return typeof value === 'number' && Number.isFinite(value)
      ? Object.freeze({ present: true, value })
      : null
  } catch {
    return null
  }
}

export function readyRegistryState(
  requestId: number | null,
  names: readonly NamedRange[],
  revision: OptionalRevisionSnapshot,
): NamedRangeRegistryState {
  const state = { status: 'ready' as const, requestId, names, error: null }
  return Object.freeze(revision.present ? { ...state, revision: revision.value! } : state)
}

export function copyMutationResult(
  result: NamedRangeMutationResult,
): NamedRangeMutationResult | null {
  if (typeof result !== 'object' || result === null) return null
  try {
    const revision = copyOptionalRevision(result)
    if (
      !Number.isSafeInteger(result.requestId) ||
      (result.outcome !== 'w0-acknowledged' && result.outcome !== 'confirmed-not-applied') ||
      revision === null
    ) {
      return null
    }
    const snapshot = { requestId: result.requestId, outcome: result.outcome }
    return Object.freeze(revision.present ? { ...snapshot, revision: revision.value! } : snapshot)
  } catch {
    return null
  }
}

export function copyCapabilities(
  value: NamedRangeBackendCapabilities,
): NamedRangeBackendCapabilities | null {
  if (typeof value !== 'object' || value === null) return null
  if (!['static-session', 'worker-ts', 'worker-wasm'].includes(value.runtime)) return null
  if (!Array.isArray(value.scopes)) return null
  const scopes: ('workbook' | 'sheet')[] = []
  for (const scope of value.scopes) {
    if (scope !== 'workbook' && scope !== 'sheet') return null
    if (!scopes.includes(scope)) scopes.push(scope)
  }
  if (
    typeof value.bindings !== 'object' ||
    value.bindings === null ||
    typeof value.bindings.range !== 'boolean' ||
    typeof value.bindings.constant !== 'boolean' ||
    typeof value.bindings.lambda !== 'boolean' ||
    typeof value.delete !== 'boolean' ||
    typeof value.namesWitness !== 'boolean'
  )
    return null
  if (!['stored-definition', 'live-reference', 'unsupported'].includes(value.rangeSemantics))
    return null
  if (!['static-session-registry', 'adapter-post-ack-overlay'].includes(value.listAuthority))
    return null
  if (!['full', 'names-only', 'none'].includes(value.definitionReadback)) return null
  if (
    !['session-registry-accepted', 'engine-accepted', 'engine-names-witnessed'].includes(
      value.mutationAck,
    )
  )
    return null
  if (value.durability !== 'session-local') return null
  return Object.freeze({
    runtime: value.runtime,
    scopes: Object.freeze(scopes),
    bindings: Object.freeze({ ...value.bindings }),
    delete: value.delete,
    rangeSemantics: value.rangeSemantics,
    listAuthority: value.listAuthority,
    definitionReadback: value.definitionReadback,
    namesWitness: value.namesWitness,
    mutationAck: value.mutationAck,
    durability: value.durability,
  })
}
