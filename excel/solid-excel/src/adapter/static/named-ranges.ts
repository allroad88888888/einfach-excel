// 一句话：命名区域注册表的维护。

import type {
  DeleteNamedRangeRequest,
  ListNamedRangesRequest,
  NamedRange,
  NamedRangeListResult,
  SetNamedRangeRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneNamedRange,
  namedRangeIdentity,
  normalizeNamedRangeName,
} from '@einfach/spreadsheet-ui-core'
import type { StaticBackendState } from './state'

export function namedRangeMatches(
  entry: NamedRange,
  name: string,
  scope: NamedRange['scope'],
): boolean {
  const targetIdentity = namedRangeIdentity(name, scope)
  return targetIdentity !== null && namedRangeIdentity(entry.name, entry.scope) === targetIdentity
}

export function setNamedRangeInState(
  state: StaticBackendState,
  request: SetNamedRangeRequest,
): void {
  const name = normalizeNamedRangeName(request.name)
  if (!name) throw new Error('invalid named range name')
  const entry: NamedRange = {
    name,
    scope: request.scope === 'workbook' ? 'workbook' : { sheetId: request.scope.sheetId },
    refersTo: { ...request.refersTo },
  }
  const existingIndex = state.namedRanges.findIndex((item) =>
    namedRangeMatches(item, name, request.scope),
  )
  state.namedRanges =
    existingIndex >= 0
      ? state.namedRanges.map((item, index) => (index === existingIndex ? entry : item))
      : [...state.namedRanges, entry]
}

export function deleteNamedRangeFromState(
  state: StaticBackendState,
  request: DeleteNamedRangeRequest,
): boolean {
  const next = state.namedRanges.filter(
    (item) => !namedRangeMatches(item, request.name, request.scope),
  )
  const changed = next.length !== state.namedRanges.length
  state.namedRanges = next
  return changed
}

export function listNamedRangesFromState(
  state: StaticBackendState,
  request?: ListNamedRangesRequest,
): NamedRangeListResult {
  return {
    requestId: request?.requestId,
    revision: request?.revision ?? state.revision,
    names: state.namedRanges.map(cloneNamedRange),
    authority: 'static-session-registry',
    definitionReadback: 'full',
  }
}
