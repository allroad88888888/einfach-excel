import { atom } from '@einfach/core'
import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend'
import { validateProjectionResult } from './contracts'
import {
  freezeProjectionRequest,
  freezeProjectionResult,
  freezeProjectionSnapshot,
  projectionErrorFrom,
  projectionLaneBackingAtom,
  projectionSnapshotBackingAtom,
} from './state'
import type {
  ApplyVisibleProjectionInput,
  ApplyVisibleProjectionOutcome,
} from './types'
import { applyProjectionRowHeights } from './projection-row-heights'

/** Publishes the projection bundled with a mutation without opening a second read lane. */
export const applyVisibleProjectionAtom = atom(
  null,
  (get, set, input: ApplyVisibleProjectionInput): ApplyVisibleProjectionOutcome => {
    const current = get(projectionSnapshotBackingAtom)
    if (
      current !== input.witness ||
      current.status === 'loading' ||
      get(projectionLaneBackingAtom).visibleWindow.active !== null
    ) {
      return Object.freeze({ status: 'superseded' })
    }

    try {
      const request = freezeProjectionRequest(input.request) as VisibleProjectionRequest
      const result = freezeProjectionResult(input.result) as VisibleProjectionResult
      const validation = validateProjectionResult(result, { request })
      if (!validation.ok) {
        const error = projectionErrorFrom(
          validation.error,
          validation.error.message,
          validation.error.code,
        )
        set(
          projectionSnapshotBackingAtom,
          freezeProjectionSnapshot({ status: 'error', request, result: current.result, error }),
        )
        return Object.freeze({ status: 'rejected', error })
      }
      set(
        projectionSnapshotBackingAtom,
        freezeProjectionSnapshot({ status: 'ready', request, result, error: undefined }),
      )
      applyProjectionRowHeights(get, set, result)
      return Object.freeze({ status: 'applied' })
    } catch (cause) {
      const error = projectionErrorFrom(cause)
      set(
        projectionSnapshotBackingAtom,
        freezeProjectionSnapshot({
          status: 'error',
          request: input.request,
          result: current.result,
          error,
        }),
      )
      return Object.freeze({ status: 'rejected', error })
    }
  },
)
applyVisibleProjectionAtom.debugLabel = 'spreadsheet.projection.applyVisible'
