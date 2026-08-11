import { atom, type Setter } from '@einfach/core'
import { copyCapabilities } from './result-snapshots'
import { namedRangeCapabilitySequenceAtom, namedRangeCapabilityStateSourceAtom } from './state'
import { nextSequence } from './primitives'
import type { CapabilityTicket } from './internal-types'
import type {
  LoadNamedRangeCapabilitiesInput,
  NamedRangeBackendCapabilities,
  NamedRangeControllerPort,
} from './types'

type ReadCapabilitiesMethod = NonNullable<NamedRangeControllerPort['readNamedRangeCapabilities']>

const reserveCapabilityReadAtom = atom(null, (get, set): CapabilityTicket | null => {
  const next = nextSequence(get(namedRangeCapabilitySequenceAtom))
  if (next === null) {
    set(
      namedRangeCapabilityStateSourceAtom,
      Object.freeze({
        status: 'unavailable',
        requestId: null,
        capabilities: null,
        error: '名称能力不可用',
      }),
    )
    return null
  }
  const ticket: CapabilityTicket = Object.freeze({ requestId: next })
  set(namedRangeCapabilitySequenceAtom, next)
  set(
    namedRangeCapabilityStateSourceAtom,
    Object.freeze({
      status: 'loading',
      requestId: ticket.requestId,
      capabilities: null,
      error: null,
    }),
  )
  return ticket
})

const settleCapabilityReadAtom = atom(
  null,
  (
    get,
    set,
    input: {
      readonly ticket: CapabilityTicket
      readonly capabilities: NamedRangeBackendCapabilities | null
    },
  ): void => {
    const current = get(namedRangeCapabilityStateSourceAtom)
    if (current.requestId !== input.ticket.requestId || current.status !== 'loading') return
    set(
      namedRangeCapabilityStateSourceAtom,
      input.capabilities === null
        ? Object.freeze({
            status: 'unavailable',
            requestId: input.ticket.requestId,
            capabilities: null,
            error: '名称能力不可用',
          })
        : Object.freeze({
            status: 'ready',
            requestId: input.ticket.requestId,
            capabilities: input.capabilities,
            error: null,
          }),
    )
  },
)

async function executeCapabilityRead(
  set: Setter,
  ticket: CapabilityTicket,
  receiver: NamedRangeControllerPort,
  execute: ReadCapabilitiesMethod | undefined,
): Promise<void> {
  if (execute === undefined) return set(settleCapabilityReadAtom, { ticket, capabilities: null })
  try {
    const value = await Reflect.apply(execute, receiver, [])
    set(settleCapabilityReadAtom, { ticket, capabilities: copyCapabilities(value) })
  } catch {
    set(settleCapabilityReadAtom, { ticket, capabilities: null })
  }
}

export const loadNamedRangeCapabilitiesAtom = atom(
  null,
  (_get, set, input: LoadNamedRangeCapabilitiesInput): void => {
    const method = input.source.readNamedRangeCapabilities
    const execute = typeof method === 'function' ? method : undefined
    const ticket = set(reserveCapabilityReadAtom)
    if (ticket !== null)
      void Promise.resolve().then(() => executeCapabilityRead(set, ticket, input.source, execute))
  },
)
loadNamedRangeCapabilitiesAtom.debugLabel = 'spreadsheet.namedRanges.loadCapabilities'
