// 一句话：命名区域端口。

import type {
  DeleteNamedRangeRequest,
  ListNamedRangesRequest,
  NamedRange,
  NamedRangeListResult,
  NamedRangeMutationResult,
  SetNamedRangeRequest,
} from '@einfach/spreadsheet-ui-core'
import { cloneNamedRange, normalizeNamedRangeName } from '@einfach/spreadsheet-ui-core'
import { createBackendError } from '../backend-error'
import {
  assertNamedRangeBackendActive,
  enqueueNamedRangeMutation,
  workerNamedRangeMutationResult,
} from '../named-range-mutation'
import {
  isNamedRangeEngineUnsupported,
  namedRangeAddressEndpoints,
  namedRangeMatches,
} from '../named-range-wire'
import { bumpRevision } from '../revision'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createNamedRangePorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'listNamedRanges' | 'setNamedRange' | 'deleteNamedRange'
> {
  return {
    async listNamedRanges(request: ListNamedRangesRequest): Promise<NamedRangeListResult> {
      return {
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        names: state.namedRanges.map(cloneNamedRange),
        authority: 'adapter-post-ack-overlay',
        definitionReadback: 'full',
        canonical: false,
      }
    },

    async setNamedRange(request: SetNamedRangeRequest): Promise<NamedRangeMutationResult> {
      return enqueueNamedRangeMutation(state, async () => {
        assertNamedRangeBackendActive(state)
        const name = normalizeNamedRangeName(request.name)
        if (!name) throw createBackendError('INVALID_NAME', 'invalid named range name')
        if (request.scope !== 'workbook') {
          return workerNamedRangeMutationResult(state, request, 'confirmed-not-applied')
        }

        await state.readyPromise
        assertNamedRangeBackendActive(state)
        try {
          const refersTo = request.refersTo
          let accepted: boolean
          if (refersTo.kind === 'lambda') {
            accepted = await state.client.defineName(name, {
              kind: 'lambda',
              params: refersTo.params,
              body: refersTo.body,
            })
          } else if (refersTo.kind === 'range') {
            // The engine owns workbook names and resolves range bindings by
            // human-readable sheet name plus separate start/end addresses.
            const sheet = state.lookup.sheets.find((candidate) => candidate.id === refersTo.sheetId)
            const endpoints = namedRangeAddressEndpoints(refersTo.address)
            if (!sheet || !endpoints) {
              return workerNamedRangeMutationResult(state, request, 'confirmed-not-applied')
            }
            accepted = await state.client.defineName(name, {
              kind: 'range',
              sheetName: sheet.name,
              ...endpoints,
            })
          } else {
            accepted = await state.client.defineName(name, {
              kind: 'value',
              literal: refersTo.value,
            })
          }

          assertNamedRangeBackendActive(state)
          if (!accepted) {
            return workerNamedRangeMutationResult(state, request, 'confirmed-not-applied')
          }
        } catch (error) {
          assertNamedRangeBackendActive(state)
          if (isNamedRangeEngineUnsupported(error)) {
            return workerNamedRangeMutationResult(state, request, 'confirmed-not-applied')
          }
          throw error
        }

        const entry: NamedRange = {
          name,
          scope: 'workbook',
          refersTo: { ...request.refersTo },
        }
        const existingIndex = state.namedRanges.findIndex((item) =>
          namedRangeMatches(item, name, request.scope),
        )
        state.namedRanges =
          existingIndex >= 0
            ? state.namedRanges.map((item, index) => (index === existingIndex ? entry : item))
            : [...state.namedRanges, entry]
        return workerNamedRangeMutationResult(state, request, 'w0-acknowledged', bumpRevision(state))
      })
    },

    async deleteNamedRange(request: DeleteNamedRangeRequest): Promise<NamedRangeMutationResult> {
      return enqueueNamedRangeMutation(state, async () => {
        assertNamedRangeBackendActive(state)
        const name = normalizeNamedRangeName(request.name)
        if (!name) throw createBackendError('INVALID_NAME', 'invalid named range name')
        if (request.scope !== 'workbook') {
          return workerNamedRangeMutationResult(state, request, 'confirmed-not-applied')
        }

        await state.readyPromise
        assertNamedRangeBackendActive(state)
        try {
          const accepted = await state.client.undefineName(name)
          assertNamedRangeBackendActive(state)
          if (!accepted) {
            return workerNamedRangeMutationResult(state, request, 'confirmed-not-applied')
          }
        } catch (error) {
          assertNamedRangeBackendActive(state)
          if (isNamedRangeEngineUnsupported(error)) {
            return workerNamedRangeMutationResult(state, request, 'confirmed-not-applied')
          }
          throw error
        }

        state.namedRanges = state.namedRanges.filter(
          (item) => !namedRangeMatches(item, name, request.scope),
        )
        return workerNamedRangeMutationResult(state, request, 'w0-acknowledged', bumpRevision(state))
      })
    },
  }
}
