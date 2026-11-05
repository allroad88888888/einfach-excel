import { atom } from '@einfach/core'
import type {
  ProjectionRequestId,
  RangeProjectionRequest,
  VisibleProjectionRequest,
} from '../contracts'
import type { SpreadsheetError } from '../shared'
import {
  createRangeProjectionRequest,
  createVisibleProjectionRequest,
  validateProjectionRequest,
  validateProjectionResult,
} from './contracts'
import {
  IDLE_PROJECTION_SNAPSHOT,
  freezeProjectionRequest,
  freezeProjectionResult,
  freezeProjectionSnapshot,
  freezeProjectionValidationError,
  nextProjectionRequestId,
  projectionErrorFrom,
  projectionLaneBackingAtom,
  projectionRequestSequenceBackingAtom,
  projectionSnapshotBackingAtom,
  sameProjectionRequest,
  successorAfterFailedRead,
  type ProjectionLaneTicket,
} from './state'
import type {
  BeginProjectionInput,
  ProjectionBeginOutcome,
  ProjectionRejectOutcome,
  ProjectionRequest,
  ProjectionResolveOutcome,
  ProjectionResult,
  ProjectionValidationResult,
  RejectProjectionInput,
  ReportProjectionErrorInput,
  ResolveProjectionInput,
} from './types'
import { applyProjectionSizes } from './projection-sizes'
import { recordPublishedGeometry } from './covering-result'
import { applySheetVisibility } from '../viewport/hidden-state'
import { setSheetProtectionAtom } from '../protection'
import { hydrateCustomFormulaDefinitionsAtom } from '../custom-formulas/expression-catalog'
import {
  hydrateCalculationModeAtom,
  hydrateIterativeCalculationAtom,
} from '../calculation/mode-state'
import { syncWatchedCellsAtom } from '../formula-auditing/watch-command'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { forgetActiveCellFact, retainActiveCellFact } from './active-cell-fact'

export * from './contracts'
export * from './types'
export { applyVisibleProjectionAtom } from './apply-visible-projection'
export { activeCellFactAtom, activeCellFormatAtom } from './active-cell-fact'
export {
  issueProjectionRequestIdAtom,
  nextProjectionRequestId,
  projectionRequestIdAtom,
  projectionSnapshotAtom,
} from './state'

function createProjectionRequest(
  input: BeginProjectionInput,
  requestId: ProjectionRequestId,
): ProjectionRequest {
  if (input.kind === 'visible-window') {
    return createVisibleProjectionRequest({
      sheetId: input.sheetId,
      window: input.window,
      viewport: input.viewport,
      requestId,
      reason: input.reason,
      revision: input.revision,
      cancelToken: input.cancelToken,
    })
  }
  return createRangeProjectionRequest({
    sheetId: input.sheetId,
    range: input.range,
    requestId,
    reason: input.reason,
    revision: input.revision,
    cancelToken: input.cancelToken,
  })
}

export const beginProjectionAtom = atom(
  null,
  (get, set, input: BeginProjectionInput): ProjectionBeginOutcome => {
    const lanes = get(projectionLaneBackingAtom)
    // Range reads keep strict busy semantics. Visible reads validate and issue
    // an identity before entering the one-slot latest-wins queue below.
    if (input.kind === 'range' && lanes.range !== null) {
      return Object.freeze({ status: 'busy' })
    }

    const requestId = nextProjectionRequestId(get(projectionRequestSequenceBackingAtom))
    if (requestId === null) {
      const error = projectionErrorFrom(
        null,
        'Projection request id capacity reached.',
        'REQUEST_ID_EXHAUSTED',
      )
      if (input.kind === 'visible-window' && lanes.visibleWindow.active === null) {
        const current = get(projectionSnapshotBackingAtom)
        set(
          projectionSnapshotBackingAtom,
          freezeProjectionSnapshot({ ...current, status: 'error', error }),
        )
      }
      return Object.freeze({ status: 'exhausted', error })
    }

    const candidate = createProjectionRequest(input, requestId)
    const validation = validateProjectionRequest(candidate, { maxCells: input.maxCells })
    if (!validation.ok) {
      return Object.freeze({
        status: 'invalid',
        error: freezeProjectionValidationError(validation.error),
      })
    }

    const request = freezeProjectionRequest(candidate)
    set(projectionRequestSequenceBackingAtom, requestId)

    if (request.kind === 'visible-window') {
      const current = get(projectionSnapshotBackingAtom)
      const ticket: ProjectionLaneTicket<VisibleProjectionRequest> = Object.freeze({
        request,
        retainResult: input.retainResult === true,
        // 刷新义务不随浏览读取消失：顶替的排队读取未完成，或保留的是失败快照里的旧结果。
        publishedCurrent: input.kind === 'visible-window' && input.browsing === true &&
          current.status !== 'error' && lanes.visibleWindow.queued?.publishedCurrent !== false,
      })

      if (lanes.visibleWindow.active !== null) {
        // Capacity is exactly one: a newer visible intent replaces the queued
        // one, but never starts another backend transport.
        set(
          projectionLaneBackingAtom,
          Object.freeze({
            ...lanes,
            visibleWindow: Object.freeze({
              active: lanes.visibleWindow.active,
              queued: ticket,
            }),
          }),
        )
        retainActiveCellFact(get, set)
        set(
          projectionSnapshotBackingAtom,
          freezeProjectionSnapshot({
            status: 'loading',
            request,
            result: ticket.retainResult ? current.result : undefined,
            error: undefined,
          }),
        )
        return Object.freeze({ status: 'queued', request })
      }

      set(
        projectionLaneBackingAtom,
        Object.freeze({
          ...lanes,
          visibleWindow: Object.freeze({ active: ticket, queued: null }),
        }),
      )
      retainActiveCellFact(get, set)
      set(
        projectionSnapshotBackingAtom,
        freezeProjectionSnapshot({
          status: 'loading',
          request,
          result: input.retainResult === true ? current.result : undefined,
          error: undefined,
        }),
      )
      return Object.freeze({ status: 'started', request })
    }

    const ticket: ProjectionLaneTicket<RangeProjectionRequest> = Object.freeze({
      request,
      retainResult: false,
    })
    set(projectionLaneBackingAtom, Object.freeze({ ...lanes, range: ticket }))
    return Object.freeze({ status: 'started', request })
  },
)
beginProjectionAtom.debugLabel = 'spreadsheet.projection.begin'

/** Clears the display projection without releasing an in-flight backend lane. */
export const resetProjectionAtom = atom(null, (_get, set): void => {
  forgetActiveCellFact(set)
  set(projectionSnapshotBackingAtom, IDLE_PROJECTION_SNAPSHOT)
})
resetProjectionAtom.debugLabel = 'spreadsheet.projection.reset'

export const resolveProjectionAtom = atom(
  null,
  (get, set, input: ResolveProjectionInput): ProjectionResolveOutcome => {
    const lanes = get(projectionLaneBackingAtom)
    if (input.request.kind === 'visible-window') {
      const active = lanes.visibleWindow.active
      if (active === null || !sameProjectionRequest(active.request, input.request)) {
        return Object.freeze({ status: 'ignored', reason: 'stale' })
      }

      let result: ProjectionResult | undefined
      let validation: ProjectionValidationResult | undefined
      try {
        result = freezeProjectionResult(input.result)
        validation = validateProjectionResult(result, { request: active.request })
      } catch {
        validation = undefined
      }

      const settled = validation?.ok === true && result !== undefined
      const successor = settled ? lanes.visibleWindow.queued
        : successorAfterFailedRead(active, lanes.visibleWindow.queued)
      set(
        projectionLaneBackingAtom,
        Object.freeze({
          ...lanes,
          visibleWindow: Object.freeze({ active: successor, queued: null }),
        }),
      )

      if (!settled || result === undefined) {
        // A malformed response settles only the exact active transport. If a
        // successor exists it was already made active and the old mismatch
        // must not become the final product error.
        if (successor === null) {
          const current = get(projectionSnapshotBackingAtom)
          if (
            current.status === 'loading' &&
            current.request !== undefined &&
            sameProjectionRequest(current.request, active.request)
          ) {
            const error = projectionErrorFrom(
              null,
              'Projection result did not match the active request.',
              'PROJECTION_RESULT_MISMATCH',
            )
            set(
              projectionSnapshotBackingAtom,
              freezeProjectionSnapshot({
                status: 'error',
                request: active.request,
                result: current.result,
                error,
              }),
            )
          }
        }
        return Object.freeze({
          status: 'ignored',
          reason: 'mismatch',
          ...(successor === null ? {} : { nextRequest: successor.request }),
        })
      }

      if (successor !== null) {
        // The queued begin already published the latest loading request. When
        // it opted into retainResult, swap the carried result for this fresher
        // one: during continuous scrolling every transport settles with a
        // successor queued, and dropping each landed result would freeze the
        // display on the pre-scroll snapshot until the queue drains. A
        // successor without retainResult asked for a blank surface (e.g. a
        // sheet switch) — never show it older data.
        if (successor.retainResult) {
          const current = get(projectionSnapshotBackingAtom)
          if (
            current.status === 'loading' &&
            current.request !== undefined &&
            sameProjectionRequest(current.request, successor.request)
          ) {
            retainActiveCellFact(get, set)
            set(projectionSnapshotBackingAtom, freezeProjectionSnapshot({ ...current, result }))
            if (result.kind === 'visible-window') applyProjectionSizes(get, set, result)
            if (result.kind === 'visible-window' && result.visibility)
              applySheetVisibility(get, set, result.sheetId, result.visibility)
            if (result.kind === 'visible-window' && result.protection)
              set(setSheetProtectionAtom, { sheetId: result.sheetId, state: result.protection })
            if (result.kind === 'visible-window' && result.calculationMode)
              set(hydrateCalculationModeAtom, result.calculationMode)
            if (result.kind === 'visible-window' && result.iterativeCalculation)
              set(hydrateIterativeCalculationAtom, result.iterativeCalculation)
            const connection = get(rustWorkbookConnectionAtom)
            if (connection && result.kind === 'visible-window' && result.customFormulaDefinitions)
              set(hydrateCustomFormulaDefinitionsAtom, {
                connection,
                definitions: result.customFormulaDefinitions,
              })
          }
        }
        return Object.freeze({
          status: 'accepted',
          result,
          nextRequest: successor.request,
        })
      }

      const current = get(projectionSnapshotBackingAtom)
      if (
        current.status !== 'loading' ||
        current.request === undefined ||
        !sameProjectionRequest(current.request, active.request)
      ) {
        return Object.freeze({ status: 'ignored', reason: 'stale' })
      }
      retainActiveCellFact(get, set)
      set(
        projectionSnapshotBackingAtom,
        freezeProjectionSnapshot({
          status: 'ready',
          request: active.request,
          result,
          error: undefined,
        }),
      )
      if (result.kind === 'visible-window') applyProjectionSizes(get, set, result)
      if (result.kind === 'visible-window' && result.visibility)
        applySheetVisibility(get, set, result.sheetId, result.visibility)
      recordPublishedGeometry(get, set)
      if (result.kind === 'visible-window' && result.protection)
        set(setSheetProtectionAtom, { sheetId: result.sheetId, state: result.protection })
      if (result.kind === 'visible-window' && result.calculationMode)
        set(hydrateCalculationModeAtom, result.calculationMode)
      if (result.kind === 'visible-window' && result.iterativeCalculation)
        set(hydrateIterativeCalculationAtom, result.iterativeCalculation)
      const connection = get(rustWorkbookConnectionAtom)
      if (connection && result.kind === 'visible-window' && result.customFormulaDefinitions)
        set(hydrateCustomFormulaDefinitionsAtom, {
          connection,
          definitions: result.customFormulaDefinitions,
        })
      if (result.kind === 'visible-window') void set(syncWatchedCellsAtom)
      return Object.freeze({ status: 'accepted', result })
    }

    const active = lanes.range
    if (active === null || !sameProjectionRequest(active.request, input.request)) {
      return Object.freeze({ status: 'ignored', reason: 'stale' })
    }

    let result: ProjectionResult | undefined
    let validation: ProjectionValidationResult | undefined
    try {
      result = freezeProjectionResult(input.result)
      validation = validateProjectionResult(result, { request: active.request })
    } catch {
      validation = undefined
    }
    set(projectionLaneBackingAtom, Object.freeze({ ...lanes, range: null }))
    if (validation === undefined || !validation.ok || result === undefined) {
      return Object.freeze({ status: 'ignored', reason: 'mismatch' })
    }
    return Object.freeze({ status: 'accepted', result })
  },
)
resolveProjectionAtom.debugLabel = 'spreadsheet.projection.resolve'

export const rejectProjectionAtom = atom(
  null,
  (get, set, input: RejectProjectionInput): ProjectionRejectOutcome => {
    const lanes = get(projectionLaneBackingAtom)
    const error = projectionErrorFrom(input.error, input.fallbackMessage)

    if (input.request.kind === 'visible-window') {
      const active = lanes.visibleWindow.active
      if (active === null || !sameProjectionRequest(active.request, input.request)) {
        return Object.freeze({ status: 'ignored', reason: 'stale' })
      }

      const successor = successorAfterFailedRead(active, lanes.visibleWindow.queued)
      set(
        projectionLaneBackingAtom,
        Object.freeze({
          ...lanes,
          visibleWindow: Object.freeze({ active: successor, queued: null }),
        }),
      )

      const current = get(projectionSnapshotBackingAtom)
      if (
        successor === null &&
        current.status === 'loading' &&
        current.request !== undefined &&
        sameProjectionRequest(current.request, active.request)
      ) {
        set(
          projectionSnapshotBackingAtom,
          freezeProjectionSnapshot({
            status: 'error',
            request: active.request,
            result: current.result,
            error,
          }),
        )
      }
      return Object.freeze({
        status: 'rejected',
        error,
        ...(successor === null ? {} : { nextRequest: successor.request }),
      })
    }

    const active = lanes.range
    if (active === null || !sameProjectionRequest(active.request, input.request)) {
      return Object.freeze({ status: 'ignored', reason: 'stale' })
    }
    set(projectionLaneBackingAtom, Object.freeze({ ...lanes, range: null }))
    return Object.freeze({ status: 'rejected', error })
  },
)
rejectProjectionAtom.debugLabel = 'spreadsheet.projection.reject'

export const reportProjectionErrorAtom = atom(
  null,
  (get, set, input: ReportProjectionErrorInput): SpreadsheetError => {
    const error = projectionErrorFrom(input.error, input.fallbackMessage, input.code)
    const current = get(projectionSnapshotBackingAtom)
    set(
      projectionSnapshotBackingAtom,
      freezeProjectionSnapshot({
        ...current,
        status: 'error',
        error,
      }),
    )
    return error
  },
)
reportProjectionErrorAtom.debugLabel = 'spreadsheet.projection.reportError'
