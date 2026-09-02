import { atom, type Getter, type Setter } from '@einfach/core'
import type { VisibleProjectionRequest } from '../backend'
import { spreadsheetBackendBindingAtom } from '../runtime/backend-state'
import {
  beginProjectionAtom,
  isProjectionResultForRequest,
  projectionSnapshotAtom,
  rejectProjectionAtom,
  resolveProjectionAtom,
} from './index'
import type { BeginVisibleProjectionInput } from './types'

export type RunVisibleProjectionInput = Omit<BeginVisibleProjectionInput, 'kind'>
export type RunVisibleProjectionOutcome =
  | { readonly status: 'ready' }
  | { readonly status: 'superseded' }
  | { readonly status: 'failed'; readonly error: string }

interface VisibleProjectionTransportBinding {
  readonly promise: Promise<void>
}

const visibleProjectionTransportBackingAtom = atom<VisibleProjectionTransportBinding | null>(null)

visibleProjectionTransportBackingAtom.debugLabel =
  'spreadsheet.projection.visibleTransport.state'

async function drainVisibleProjectionQueue(
  get: Getter,
  set: Setter,
  initialRequest: VisibleProjectionRequest,
): Promise<void> {
  const binding = get(spreadsheetBackendBindingAtom)
  if (binding === null) {
    const error = new Error('Spreadsheet backend is not bound to this store.')
    let request = initialRequest
    while (true) {
      const outcome = set(rejectProjectionAtom, { request, error })
      if (outcome.status !== 'rejected' || outcome.nextRequest?.kind !== 'visible-window') return
      request = outcome.nextRequest
    }
  }
  const { backend } = binding

  let request = initialRequest
  while (true) {
    try {
      const result = await backend.readVisibleProjection(request)
      const outcome = set(resolveProjectionAtom, { request, result })
      if (outcome.nextRequest?.kind === 'visible-window') {
        request = outcome.nextRequest
        continue
      }
      if (outcome.status !== 'accepted') {
        throw new Error('Projection result did not match the active request.')
      }
      return
    } catch (error) {
      const outcome = set(rejectProjectionAtom, { request, error })
      if (outcome.status === 'rejected' && outcome.nextRequest?.kind === 'visible-window') {
        request = outcome.nextRequest
        continue
      }
      return
    }
  }
}

function projectionOutcome(
  get: Getter,
  request: VisibleProjectionRequest,
): RunVisibleProjectionOutcome {
  const snapshot = get(projectionSnapshotAtom)
  if (
    snapshot.status === 'ready' &&
    snapshot.request?.requestId === request.requestId &&
    snapshot.result !== undefined &&
    isProjectionResultForRequest(request, snapshot.result)
  ) {
    return Object.freeze({ status: 'ready' })
  }
  if (snapshot.status === 'error' && snapshot.request?.requestId === request.requestId) {
    return Object.freeze({
      status: 'failed',
      error: snapshot.error?.message ?? 'Spreadsheet projection failed.',
    })
  }
  return Object.freeze({ status: 'superseded' })
}

/** Runs the store-local visible projection transport through the bound backend. */
export const runVisibleProjectionAtom = atom(
  null,
  async (get, set, input: RunVisibleProjectionInput): Promise<RunVisibleProjectionOutcome> => {
    const begin = set(beginProjectionAtom, { ...input, kind: 'visible-window' })
    if (begin.status === 'invalid' || begin.status === 'exhausted') {
      return Object.freeze({ status: 'failed', error: begin.error.message })
    }
    if (
      (begin.status !== 'started' && begin.status !== 'queued') ||
      begin.request.kind !== 'visible-window'
    ) {
      return Object.freeze({ status: 'failed', error: 'Visible projection transport is busy.' })
    }

    let transportBinding = get(visibleProjectionTransportBackingAtom)
    const ownsTransport = begin.status === 'started'
    if (ownsTransport) {
      transportBinding = { promise: drainVisibleProjectionQueue(get, set, begin.request) }
      set(visibleProjectionTransportBackingAtom, transportBinding)
    }
    if (transportBinding === null) {
      return Object.freeze({
        status: 'failed',
        error: 'Visible projection transport is unavailable.',
      })
    }

    try {
      await transportBinding.promise
    } finally {
      if (ownsTransport && get(visibleProjectionTransportBackingAtom) === transportBinding) {
        set(visibleProjectionTransportBackingAtom, null)
      }
    }
    return projectionOutcome(get, begin.request)
  },
)

runVisibleProjectionAtom.debugLabel = 'spreadsheet.projection.runVisible'
