import { atom, type Setter } from '@einfach/core'
import {
  nameManagerDraftGenerationSourceAtom,
  nameManagerSessionIdAtom,
} from './name-manager-draft'
import { managerCloseWitnessForMutation } from './name-manager-lifecycle'
import { copyRefersTo, copyScope } from './snapshots'
import { scheduleCapturedRegistryRead } from './registry'
import {
  guardNamedRangeMutationTransportAtom,
  reserveNamedRangeMutationAtom,
} from './mutation-reservation'
import {
  markNamedRangeMutationUnknownAtom,
  namedRangeMutationGenerationIsCurrentAtom,
  settleNamedRangeMutationResultAtom,
} from './mutation-settlement'
import type {
  NamedRangeControllerPort,
  RunNamedRangeMutationInput,
  SetNamedRangeRequest,
  DeleteNamedRangeRequest,
} from './types'
import type { NamedRangeMutationTicket } from './internal-types'

type MutationMethod =
  | NonNullable<NamedRangeControllerPort['setNamedRange']>
  | NonNullable<NamedRangeControllerPort['deleteNamedRange']>
type ListNamedRangesMethod = NonNullable<NamedRangeControllerPort['listNamedRanges']>

function copyMutationRequest(
  request: Readonly<SetNamedRangeRequest | DeleteNamedRangeRequest>,
): SetNamedRangeRequest | DeleteNamedRangeRequest {
  const scope = copyScope(request.scope) ?? 'workbook'
  return request.kind === 'delete-named-range'
    ? { kind: request.kind, name: request.name, scope, requestId: request.requestId }
    : {
        kind: request.kind,
        name: request.name,
        scope,
        refersTo: copyRefersTo(request.refersTo)!,
        requestId: request.requestId,
      }
}

async function executeNamedRangeMutation(
  set: Setter,
  ticket: NamedRangeMutationTicket,
  receiver: NamedRangeControllerPort,
  execute: MutationMethod,
  list: ListNamedRangesMethod,
): Promise<void> {
  if (!set(guardNamedRangeMutationTransportAtom, ticket)) return
  try {
    const result = await Reflect.apply(execute, receiver, [copyMutationRequest(ticket.request)])
    const outcome = set(settleNamedRangeMutationResultAtom, { ticket, result })
    if (outcome === 'w0-acknowledged' && set(namedRangeMutationGenerationIsCurrentAtom, ticket)) {
      scheduleCapturedRegistryRead(set, receiver, list, managerCloseWitnessForMutation(ticket))
    }
  } catch {
    set(markNamedRangeMutationUnknownAtom, ticket)
  }
}

export const runNamedRangeMutationAtom = atom(
  null,
  (get, set, input: RunNamedRangeMutationInput): void => {
    const managerSessionId = get(nameManagerSessionIdAtom)
    if (
      input.origin === 'name-manager' &&
      input.sessionId !== undefined &&
      input.sessionId !== managerSessionId
    )
      return
    const mutationMethod =
      input.mutation.action === 'set' ? input.source.setNamedRange : input.source.deleteNamedRange
    const execute = typeof mutationMethod === 'function' ? mutationMethod : undefined
    const listMethod = input.source.listNamedRanges
    const list = typeof listMethod === 'function' ? listMethod : undefined
    const sessionId = input.sessionId ?? (input.origin === 'name-manager' ? managerSessionId : 0)
    const ticket = set(reserveNamedRangeMutationAtom, {
      origin: input.origin,
      sessionId,
      managerDraftGeneration:
        input.origin === 'name-manager' ? get(nameManagerDraftGenerationSourceAtom) : null,
      mutation: input.mutation,
      mutationMethodAvailable: execute !== undefined,
      listMethodAvailable: list !== undefined,
    })
    if (ticket !== null && execute !== undefined && list !== undefined) {
      void Promise.resolve().then(() =>
        executeNamedRangeMutation(set, ticket, input.source, execute, list),
      )
    }
  },
)
runNamedRangeMutationAtom.debugLabel = 'spreadsheet.namedRanges.runMutation'
