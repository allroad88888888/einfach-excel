// 一句话：命名区域变更的串行化与 ACK 组装。

import type {
  DeleteNamedRangeRequest,
  NamedRangeMutationResult,
  ProjectionRevision,
  SetNamedRangeRequest,
} from '@einfach/spreadsheet-ui-core'
import { createBackendError } from './backend-error'
import type { WorkerBackendState } from './state'

export function assertNamedRangeBackendActive(state: WorkerBackendState): void {
  if (state.disposed) {
    throw createBackendError(
      'BACKEND_DISPOSED',
      'named range mutation completed after the worker backend was disposed',
    )
  }
}

export function enqueueNamedRangeMutation(
  state: WorkerBackendState,
  mutation: () => Promise<NamedRangeMutationResult>,
): Promise<NamedRangeMutationResult> {
  const result = state.namedRangeMutationTail.then(mutation, mutation)
  state.namedRangeMutationTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export function workerNamedRangeMutationResult(
  state: WorkerBackendState,
  request: SetNamedRangeRequest | DeleteNamedRangeRequest,
  outcome: NamedRangeMutationResult['outcome'],
  resultRevision: ProjectionRevision = state.revision,
): NamedRangeMutationResult {
  return {
    requestId: request.requestId,
    revision: request.revision ?? resultRevision,
    outcome,
    authority: 'worker-engine-ack',
    canonical: false,
  }
}
