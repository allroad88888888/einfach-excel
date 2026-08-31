// 一句话：隐藏行/列批量增删的预检与施加。

import type {
  HideColumnsRequest,
  HideRowsRequest,
  ProjectionRevision,
  UnhideColumnsRequest,
  UnhideRowsRequest,
} from '@einfach/spreadsheet-ui-core'
import { beginUndoableMutation, recordHiddenIndexBefore } from './history-record'
import { nextRevisionOrThrow } from './revision'
import type { StaticBackendState } from './state'

type HiddenIndexMutationRequest =
  | HideRowsRequest
  | UnhideRowsRequest
  | HideColumnsRequest
  | UnhideColumnsRequest

type StaticHiddenIndexMutationPlan =
  | {
      status: 'noop'
      axis: 'row' | 'column'
      hide: boolean
      changedIndices: number[]
    }
  | {
      status: 'apply'
      axis: 'row' | 'column'
      hide: boolean
      changedIndices: number[]
      nextRevision: ProjectionRevision
    }

function invalidHiddenIndexMutation(message: string): never {
  throw new Error(`invalid hidden index mutation: ${message}`)
}

export function preflightHiddenIndexMutation(
  state: StaticBackendState,
  request: HiddenIndexMutationRequest,
): StaticHiddenIndexMutationPlan {
  if (!request || typeof request !== 'object') {
    return invalidHiddenIndexMutation('request must be an object')
  }
  if (typeof request.sheetId !== 'string' || request.sheetId.length === 0) {
    return invalidHiddenIndexMutation('sheetId must be a non-empty string')
  }
  if (!state.sheets.some((sheet) => sheet.id === request.sheetId)) {
    return invalidHiddenIndexMutation(`unknown sheet: ${request.sheetId}`)
  }
  if (request.revision !== undefined && request.revision !== state.revision) {
    return invalidHiddenIndexMutation(
      `revision conflict: expected ${String(request.revision)}, current ${String(state.revision)}`,
    )
  }

  let axis: 'row' | 'column'
  let hide: boolean
  let rawIndices: unknown
  switch (request.kind) {
    case 'hide-rows':
      axis = 'row'
      hide = true
      rawIndices = request.rowIndices
      break
    case 'unhide-rows':
      axis = 'row'
      hide = false
      rawIndices = request.rowIndices
      break
    case 'hide-columns':
      axis = 'column'
      hide = true
      rawIndices = request.colIndices
      break
    case 'unhide-columns':
      axis = 'column'
      hide = false
      rawIndices = request.colIndices
      break
    default:
      return invalidHiddenIndexMutation('unknown mutation kind')
  }

  if (!Array.isArray(rawIndices)) {
    return invalidHiddenIndexMutation(
      `${axis === 'row' ? 'rowIndices' : 'colIndices'} must be an array`,
    )
  }
  const normalized = new Set<number>()
  for (const index of rawIndices) {
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
      return invalidHiddenIndexMutation('indices must be non-negative safe integers')
    }
    normalized.add(index)
  }

  const canonical = [...normalized].sort((left, right) => left - right)
  const live =
    axis === 'row'
      ? state.hiddenRowsBySheetId.get(request.sheetId)
      : state.hiddenColsBySheetId.get(request.sheetId)
  const changedIndices = canonical.filter((index) => (live?.has(index) ?? false) !== hide)
  if (changedIndices.length === 0) {
    return { status: 'noop', axis, hide, changedIndices }
  }

  return {
    status: 'apply',
    axis,
    hide,
    changedIndices,
    // Preflight the revision witness before history or canonical state is touched.
    nextRevision: nextRevisionOrThrow(state.revision),
  }
}

export function applyHiddenIndexMutationPlan(
  state: StaticBackendState,
  sheetId: string,
  plan: Extract<StaticHiddenIndexMutationPlan, { status: 'apply' }>,
): void {
  beginUndoableMutation(state)
  for (const index of plan.changedIndices) {
    recordHiddenIndexBefore(state, sheetId, plan.axis, index)
  }

  const hiddenBySheetId =
    plan.axis === 'row' ? state.hiddenRowsBySheetId : state.hiddenColsBySheetId
  const live = hiddenBySheetId.get(sheetId) ?? new Set<number>()
  for (const index of plan.changedIndices) {
    if (plan.hide) {
      live.add(index)
    } else {
      live.delete(index)
    }
  }
  if (live.size === 0) {
    hiddenBySheetId.delete(sheetId)
  } else {
    hiddenBySheetId.set(sheetId, live)
  }
  state.revision = plan.nextRevision
}
