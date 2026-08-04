// 一句话：命名区域端口。

import type {
  DeleteNamedRangeRequest,
  ListNamedRangesRequest,
  NamedRangeListResult,
  NamedRangeMutationResult,
  SetNamedRangeRequest,
} from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { beginUndoableMutation, recordNamedRangesBefore } from '../history-record'
import {
  deleteNamedRangeFromState,
  listNamedRangesFromState,
  namedRangeMatches,
  setNamedRangeInState,
} from '../named-ranges'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'

export function createNamedRangePorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'listNamedRanges' | 'setNamedRange' | 'deleteNamedRange'> {
  return {
    async listNamedRanges(request: ListNamedRangesRequest): Promise<NamedRangeListResult> {
      return listNamedRangesFromState(state, request)
    },
    async setNamedRange(request: SetNamedRangeRequest): Promise<NamedRangeMutationResult> {
      beginUndoableMutation(state)
      recordNamedRangesBefore(state)
      setNamedRangeInState(state, request)
      state.revision = bumpRevision(state.revision)
      return {
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        outcome: 'w0-acknowledged',
        authority: 'static-session-registry',
      }
    },
    async deleteNamedRange(request: DeleteNamedRangeRequest): Promise<NamedRangeMutationResult> {
      const exists = state.namedRanges.some((item) =>
        namedRangeMatches(item, request.name, request.scope),
      )
      if (!exists) {
        return {
          requestId: request.requestId,
          revision: request.revision ?? state.revision,
          outcome: 'confirmed-not-applied',
          authority: 'static-session-registry',
        }
      }
      beginUndoableMutation(state)
      recordNamedRangesBefore(state)
      deleteNamedRangeFromState(state, request)
      state.revision = bumpRevision(state.revision)
      return {
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        outcome: 'w0-acknowledged',
        authority: 'static-session-registry',
      }
    },
  }
}
