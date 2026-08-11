import type {
  NamedRangeCapabilityState,
  NamedRangeMutationState,
  NamedRangeRegistryState,
} from './types'

export const NAMED_RANGE_CACHE_MAX = 500
export const NAMED_RANGE_MUTATION_LEDGER_MAX = 32

export const OPERATION_RESULT_UNCONFIRMED = '操作结果未确认'
export const REGISTRY_RESULT_UNCONFIRMED = '名称列表未确认'

export const INITIAL_CAPABILITY_STATE: NamedRangeCapabilityState = Object.freeze({
  status: 'idle',
  requestId: null,
  capabilities: null,
  error: null,
})

export const INITIAL_REGISTRY_STATE: NamedRangeRegistryState = Object.freeze({
  status: 'idle',
  requestId: null,
  names: Object.freeze([]),
  error: null,
})

export const INITIAL_MUTATION_STATE: NamedRangeMutationState = Object.freeze({
  status: 'idle',
  operationId: null,
  requestId: null,
  origin: null,
  sessionId: null,
  action: null,
  outcome: null,
  error: null,
})
