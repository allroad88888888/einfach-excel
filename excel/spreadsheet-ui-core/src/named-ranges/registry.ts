import { atom, type Setter } from '@einfach/core'
import { REGISTRY_RESULT_UNCONFIRMED } from './constants'
import { closeOwnedManagerSessionAfterRefresh } from './name-manager-lifecycle'
import { nextSequence } from './primitives'
import {
  copyOptionalRevision,
  readyRegistryState,
  type OptionalRevisionSnapshot,
} from './result-snapshots'
import { copyRegistry } from './snapshots'
import {
  namedRangeCapabilityStateSourceAtom,
  namedRangeRegistryStateSourceAtom,
  namedRangeRequestSequenceAtom,
} from './state'
import type {
  ManagerCloseWitness,
  RegistryReadReservationInput,
  RegistryReadTicket,
} from './internal-types'
import type {
  NamedRange,
  NamedRangeControllerPort,
  NamedRangeListResult,
  RefreshNamedRangeRegistryInput,
} from './types'

type ListNamedRangesMethod = NonNullable<NamedRangeControllerPort['listNamedRanges']>

export const nameRegistryCacheAtom = atom(
  (get) => get(namedRangeRegistryStateSourceAtom).names,
  (get, set, names: NamedRangeListResult['names']): void => {
    const snapshot = copyRegistry(names)
    const current = get(namedRangeRegistryStateSourceAtom)
    set(
      namedRangeRegistryStateSourceAtom,
      snapshot === null
        ? Object.freeze({
            ...current,
            status: 'projection-unknown',
            error: REGISTRY_RESULT_UNCONFIRMED,
          })
        : Object.freeze({ ...current, status: 'ready', names: snapshot, error: null }),
    )
  },
)
nameRegistryCacheAtom.debugLabel = 'spreadsheet.namedRanges.cache'

const reserveRegistryReadAtom = atom(
  null,
  (get, set, input: RegistryReadReservationInput): RegistryReadTicket | null => {
    const capability = get(namedRangeCapabilityStateSourceAtom)
    if (capability.status !== 'ready' || capability.requestId === null) return null
    if (!input.methodAvailable) {
      const current = get(namedRangeRegistryStateSourceAtom)
      set(
        namedRangeRegistryStateSourceAtom,
        Object.freeze({
          ...current,
          status: 'projection-unknown',
          error: REGISTRY_RESULT_UNCONFIRMED,
        }),
      )
      return null
    }
    const next = nextSequence(get(namedRangeRequestSequenceAtom))
    if (next === null) {
      const current = get(namedRangeRegistryStateSourceAtom)
      set(
        namedRangeRegistryStateSourceAtom,
        Object.freeze({
          ...current,
          status: 'projection-unknown',
          error: REGISTRY_RESULT_UNCONFIRMED,
        }),
      )
      return null
    }
    const witness = input.managerCloseWitness
    const ticket: RegistryReadTicket = Object.freeze({
      requestId: next,
      capabilityRequestId: capability.requestId,
      ...(witness === undefined ? {} : { managerCloseWitness: Object.freeze({ ...witness }) }),
    })
    const current = get(namedRangeRegistryStateSourceAtom)
    set(namedRangeRequestSequenceAtom, next)
    set(
      namedRangeRegistryStateSourceAtom,
      Object.freeze({ ...current, status: 'refreshing', requestId: ticket.requestId, error: null }),
    )
    return ticket
  },
)

const settleRegistryReadAtom = atom(
  null,
  (
    get,
    set,
    input: { readonly ticket: RegistryReadTicket; readonly result: NamedRangeListResult | null },
  ): void => {
    const current = get(namedRangeRegistryStateSourceAtom)
    const capability = get(namedRangeCapabilityStateSourceAtom)
    if (capability.status !== 'ready' || capability.requestId !== input.ticket.capabilityRequestId)
      return
    if (current.requestId !== input.ticket.requestId || current.status !== 'refreshing') return
    let names: readonly NamedRange[] | null = null
    let revision: OptionalRevisionSnapshot | null = null
    try {
      if (input.result !== null && input.result.requestId === input.ticket.requestId) {
        names = copyRegistry(input.result.names)
        revision = copyOptionalRevision(input.result)
      }
    } catch {
      /* invalid adapter payload */
    }
    if (names === null || revision === null) {
      set(
        namedRangeRegistryStateSourceAtom,
        Object.freeze({
          ...current,
          status: 'projection-unknown',
          error: REGISTRY_RESULT_UNCONFIRMED,
        }),
      )
      return
    }
    set(
      namedRangeRegistryStateSourceAtom,
      readyRegistryState(input.ticket.requestId, names, revision),
    )
    closeOwnedManagerSessionAfterRefresh(get, set, input.ticket.managerCloseWitness)
  },
)

async function executeRegistryRead(
  set: Setter,
  ticket: RegistryReadTicket,
  receiver: NamedRangeControllerPort,
  execute: ListNamedRangesMethod,
): Promise<void> {
  let result: NamedRangeListResult | null = null
  try {
    result = await Reflect.apply(execute, receiver, [
      { kind: 'list-named-ranges', requestId: ticket.requestId },
    ])
  } catch {
    /* adapter rejected read */
  }
  set(settleRegistryReadAtom, { ticket, result })
}

export function scheduleCapturedRegistryRead(
  set: Setter,
  receiver: NamedRangeControllerPort,
  execute: ListNamedRangesMethod | undefined,
  managerCloseWitness?: ManagerCloseWitness,
): void {
  const ticket = set(reserveRegistryReadAtom, {
    methodAvailable: execute !== undefined,
    managerCloseWitness,
  })
  if (ticket !== null && execute !== undefined)
    void Promise.resolve().then(() => executeRegistryRead(set, ticket, receiver, execute))
}

export const refreshNamedRangeRegistryAtom = atom(
  null,
  (_get, set, input: RefreshNamedRangeRegistryInput): void => {
    const method = input.source.listNamedRanges
    scheduleCapturedRegistryRead(
      set,
      input.source,
      typeof method === 'function' ? method : undefined,
    )
  },
)
refreshNamedRangeRegistryAtom.debugLabel = 'spreadsheet.namedRanges.refreshRegistry'

export const setNameRegistryAtom = atom(
  (get) => get(nameRegistryCacheAtom),
  (get, set, result: NamedRangeListResult): void => {
    let names: readonly NamedRange[] | null = null
    let revision: OptionalRevisionSnapshot | null = null
    try {
      if (typeof result === 'object' && result !== null) {
        names = copyRegistry(result.names)
        revision = copyOptionalRevision(result)
      }
    } catch {
      /* invalid adapter payload */
    }
    const current = get(namedRangeRegistryStateSourceAtom)
    set(
      namedRangeRegistryStateSourceAtom,
      names === null || revision === null
        ? Object.freeze({
            ...current,
            status: 'projection-unknown',
            error: REGISTRY_RESULT_UNCONFIRMED,
          })
        : readyRegistryState(current.requestId, names, revision),
    )
  },
)
setNameRegistryAtom.debugLabel = 'spreadsheet.namedRanges.setRegistry'
