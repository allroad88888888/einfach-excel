// 一句话：AutoFill 专用的 revision 前置校验与推进。

import type {
  AutoFillMutationResult,
  FillRangeRequest,
  FillSeriesRequest,
  ProjectionRevision,
} from '@einfach/spreadsheet-ui-core'
import { invalidAutoFill } from './auto-fill-wire'
import { advanceAutoFillEpochRevision } from './revision'
import type { WorkerBackendState } from './state'

export function assertCurrentAutoFillRevision(
  state: WorkerBackendState,
  request: FillRangeRequest | FillSeriesRequest,
): void {
  if (request.revision !== undefined && !Object.is(request.revision, state.revision)) {
    invalidAutoFill(
      `stale revision ${String(request.revision)}; current revision is ${String(state.revision)}`,
    )
  }
}

export function advanceAutoFillRevision(state: WorkerBackendState): ProjectionRevision {
  return advanceAutoFillEpochRevision(state)
}

export function advanceAutoFillUnknownRevision(state: WorkerBackendState): ProjectionRevision {
  // `advanceAutoFillEpochRevision` crosses MAX_SAFE_INTEGER as a canonical
  // decimal string and moves arbitrary opaque witnesses into a
  // per-backend sequence. It therefore cannot fail after the
  // native/history mutation may have run — unlike the plain
  // `bumpRevision` every other mutation family uses.
  return advanceAutoFillEpochRevision(state)
}

export function assertUnchangedAutoFillEpoch(
  state: WorkerBackendState,
  expected: ProjectionRevision,
): void {
  if (!Object.is(state.revision, expected)) {
    invalidAutoFill(
      `workbook revision changed during auto-fill preflight; expected ${String(
        expected,
      )}, current revision is ${String(state.revision)}`,
    )
  }
}

export function enqueueAutoFillMutation(
  state: WorkerBackendState,
  mutation: () => Promise<AutoFillMutationResult>,
): Promise<AutoFillMutationResult> {
  const result = state.autoFillMutationTail.then(mutation, mutation)
  state.autoFillMutationTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
