import { atom } from '@einfach/core'
import type { AtomEntity } from '@einfach/core'
import type { CellRange } from '../shared'
import type { SpreadsheetCellFormat } from '../backend'
import type {
  FormatCellsDialogId,
  FormatCellsLocalAcknowledgement,
  FormatCellsSaveAttempt,
  FormatCellsSaveRequest,
  FormatCellsSaveResult,
  RunFormatCellsSaveInput,
} from './types'
import {
  formatCellsCapabilityCaptureReservationAtom,
  INTRINSIC_REFLECT_APPLY,
} from './format-save-capabilities'
import {
  matchesOwnedState,
  nextSafeIdentity,
  reserveLedgerSlot,
  settleLedger,
  type SaveController,
  type SaveLaunch,
  type SaveOpenState,
} from './format-save-ledger'
import { runWithTimeout, safeErrorMessage } from './format-save-transport'
import {
  freezeJsonSnapshot,
  isValidRange,
  snapshotLocalAcknowledgement,
  snapshotSourceRanges,
  validateBackendAcknowledgement,
} from './format-save-validation'

/** Shared Core-owned save coordinator used by both Format Cells dialogs. */
export function createFormatCellsSaveController<
  State extends SaveOpenState | { readonly status: 'closed' },
>(
  dialog: FormatCellsDialogId,
  sourceAtom: AtomEntity<State>,
  formatForOpenState: (state: Extract<State, SaveOpenState>) => SpreadsheetCellFormat,
): SaveController {
  const ledgerSourceAtom = atom<readonly FormatCellsSaveAttempt[]>(Object.freeze([]))
  const requestSequenceAtom = atom(0)
  const launchAtom = atom<SaveLaunch | null>(null)
  const ledgerAtom = atom((get) => get(ledgerSourceAtom))
  const blockedAtom = atom((get) => {
    const state = get(sourceAtom)
    return (
      get(ledgerSourceAtom).some((attempt) => attempt.status === 'outcome-unknown') ||
      (state.status === 'open' && (state.pending || state.phase === 'outcome-unknown-blocked'))
    )
  })

  const runAtom = atom(
    null,
    async (get, set, input?: RunFormatCellsSaveInput): Promise<FormatCellsSaveResult> => {
      if (get(formatCellsCapabilityCaptureReservationAtom) !== null) return 'blocked'
      const activeLaunch = get(launchAtom)
      if (activeLaunch !== null) {
        if (activeLaunch.sensitive) {
          set(launchAtom, Object.freeze({ ...activeLaunch, reentered: true }))
        }
        return 'blocked'
      }
      const initial = get(sourceAtom)
      if (initial.status !== 'open' || initial.pending) return 'blocked'
      if (
        initial.phase === 'outcome-unknown-blocked' ||
        get(ledgerSourceAtom).some((attempt) => attempt.status === 'outcome-unknown')
      ) {
        set(sourceAtom, {
          ...initial,
          phase: 'outcome-unknown-blocked',
          pending: false,
          error: initial.error ?? 'Format save is blocked by an operation with an unknown outcome',
        } as State)
        return 'blocked'
      }

      const launchToken = Object.freeze({})
      const capture: SaveLaunch = Object.freeze({
        token: launchToken,
        operationId: '',
        sessionId: initial.sessionId,
        requestId: 0,
        reentered: false,
        launched: false,
        sensitive: true,
      })
      set(launchAtom, capture)
      const currentLaunch = (): SaveLaunch | null => {
        const current = get(launchAtom)
        return current?.token === launchToken ? current : null
      }
      const updateLaunch = (patch: Partial<SaveLaunch>): boolean => {
        const current = currentLaunch()
        if (current === null) return false
        set(launchAtom, Object.freeze({ ...current, ...patch, token: launchToken }))
        return true
      }
      const releaseLaunch = (): void => {
        if (currentLaunch() !== null) set(launchAtom, null)
      }
      const wasReentered = (): boolean => currentLaunch()?.reentered === true
      const validating = {
        ...initial,
        phase: 'validating' as const,
        pending: true,
        requestId: null,
        error: null,
      }
      set(sourceAtom, validating as State)

      let resolveSourceRanges: unknown
      let setFormatRange: unknown
      let refreshProjection: unknown
      let timeoutValue: unknown
      try {
        resolveSourceRanges = input?.resolveSourceRanges
        setFormatRange = input?.setFormatRange
        refreshProjection = input?.refreshProjection
        timeoutValue = input?.timeoutMs
      } catch {
        resolveSourceRanges = null
        setFormatRange = null
        refreshProjection = null
        timeoutValue = null
      } finally {
        updateLaunch({ sensitive: false })
      }
      if (wasReentered() || currentLaunch() === null || get(sourceAtom) !== (validating as State)) {
        const reentered = wasReentered()
        if (reentered && get(sourceAtom) === (validating as State)) {
          set(sourceAtom, {
            ...validating,
            phase: 'error-open',
            pending: false,
            error: 'Format save port capture was reentrant',
          } as State)
        }
        releaseLaunch()
        return reentered ? 'error-open' : 'stale'
      }
      if (
        typeof resolveSourceRanges !== 'function' ||
        typeof setFormatRange !== 'function' ||
        typeof refreshProjection !== 'function'
      ) {
        set(sourceAtom, {
          ...validating,
          phase: 'error-open',
          pending: false,
          error: 'Format save ports are unavailable',
        } as State)
        releaseLaunch()
        return 'error-open'
      }
      if (initial.sheetId.length === 0 || !isValidRange(initial.range)) {
        set(sourceAtom, {
          ...validating,
          phase: 'error-open',
          pending: false,
          error: 'Format save target is invalid',
        } as State)
        releaseLaunch()
        return 'error-open'
      }

      let format: SpreadsheetCellFormat
      try {
        format = freezeJsonSnapshot(
          formatForOpenState(initial as unknown as Extract<State, SaveOpenState>),
        )
      } catch {
        set(sourceAtom, {
          ...validating,
          phase: 'error-open',
          pending: false,
          error: 'Format save draft could not be snapshotted',
        } as State)
        releaseLaunch()
        return 'error-open'
      }
      const nextLedger = reserveLedgerSlot(get(ledgerSourceAtom))
      const requestId = nextSafeIdentity(get(requestSequenceAtom))
      if (nextLedger === null || requestId === null) {
        set(sourceAtom, {
          ...validating,
          phase: 'error-open',
          pending: false,
          error:
            nextLedger === null
              ? 'Format save journal is full of unresolved attempts'
              : 'Format save request identity space is exhausted',
        } as State)
        releaseLaunch()
        return 'error-open'
      }

      const range = Object.freeze({ ...initial.range })
      const request: FormatCellsSaveRequest = Object.freeze({
        kind: 'save-format-range',
        dialog,
        sheetId: initial.sheetId,
        range,
        format,
        sessionId: initial.sessionId,
        requestId,
      })
      const operationId = `${dialog}-${initial.sessionId}-${requestId}`
      updateLaunch({ operationId, requestId })
      const attempt: FormatCellsSaveAttempt = Object.freeze({
        operationId,
        dialog,
        sheetId: initial.sheetId,
        range,
        sessionId: initial.sessionId,
        requestId,
        status: 'pending',
      })
      const pending = {
        ...validating,
        requestId,
      }
      set(requestSequenceAtom, requestId)
      set(ledgerSourceAtom, Object.freeze([...nextLedger, attempt]))
      set(sourceAtom, pending as State)

      await Promise.resolve()
      if (
        currentLaunch() === null ||
        !matchesOwnedState(get(sourceAtom), request) ||
        wasReentered()
      ) {
        set(
          ledgerSourceAtom,
          Object.freeze(get(ledgerSourceAtom).filter((entry) => entry.operationId !== operationId)),
        )
        releaseLaunch()
        return 'stale'
      }
      const published = {
        ...(get(sourceAtom) as unknown as Extract<State, SaveOpenState>),
        phase: 'pending-published' as const,
      }
      set(sourceAtom, published as State)
      updateLaunch({ launched: true })

      let result: unknown
      let timedOut = false
      let mutationMayHaveStarted = false
      try {
        const pipeline = (async (): Promise<FormatCellsLocalAcknowledgement> => {
          let rangesPromise: Promise<unknown>
          updateLaunch({ sensitive: true })
          try {
            rangesPromise = Promise.resolve(
              INTRINSIC_REFLECT_APPLY(resolveSourceRanges, undefined, [
                request.sheetId,
                request.range,
              ]),
            )
          } finally {
            updateLaunch({ sensitive: false })
          }
          const rangesValue = await rangesPromise
          updateLaunch({ sensitive: true })
          let sourceRanges: readonly CellRange[] | null
          try {
            sourceRanges = snapshotSourceRanges(rangesValue)
          } finally {
            updateLaunch({ sensitive: false })
          }
          if (sourceRanges === null || wasReentered()) {
            throw new Error(
              wasReentered()
                ? 'Format source-range resolution was reentrant'
                : 'Format source-range resolution returned invalid ranges',
            )
          }
          for (const sourceRange of sourceRanges) {
            if (timedOut || !matchesOwnedState(get(sourceAtom), request)) {
              throw new Error('Format save target changed during source-range dispatch')
            }
            const backendRequest = Object.freeze({
              kind: 'set-format-range' as const,
              sheetId: request.sheetId,
              range: sourceRange,
              format: request.format,
              requestId: request.requestId,
            })
            let acknowledgementPromise: Promise<unknown>
            updateLaunch({ sensitive: true })
            try {
              // This assignment is the write boundary. Once the provider is
              // invoked it may have mutated before throwing, rejecting or
              // returning an unreadable acknowledgement, so Core must retain
              // outcome-unknown backpressure from this point onward.
              mutationMayHaveStarted = true
              acknowledgementPromise = Promise.resolve(
                INTRINSIC_REFLECT_APPLY(setFormatRange, undefined, [backendRequest]),
              )
            } finally {
              updateLaunch({ sensitive: false })
            }
            const acknowledgementValue = await acknowledgementPromise
            updateLaunch({ sensitive: true })
            let acknowledgementError: string | null
            try {
              acknowledgementError = validateBackendAcknowledgement(
                acknowledgementValue,
                request,
                sourceRange,
              )
            } finally {
              updateLaunch({ sensitive: false })
            }
            if (acknowledgementError !== null || wasReentered()) {
              throw new Error(
                wasReentered()
                  ? 'Format range acknowledgement was reentrant'
                  : acknowledgementError!,
              )
            }
          }
          if (timedOut || !matchesOwnedState(get(sourceAtom), request)) {
            throw new Error('Format save target changed before projection refresh')
          }
          let refreshPromise: Promise<unknown>
          updateLaunch({ sensitive: true })
          try {
            refreshPromise = Promise.resolve(
              INTRINSIC_REFLECT_APPLY(refreshProjection, undefined, [request.sheetId]),
            )
          } finally {
            updateLaunch({ sensitive: false })
          }
          await refreshPromise
          if (timedOut || wasReentered()) {
            throw new Error(
              timedOut ? 'Format save timed out' : 'Format projection refresh was reentrant',
            )
          }
          return Object.freeze({
            kind: 'local-acknowledged',
            dialog: request.dialog,
            sheetId: request.sheetId,
            range: request.range,
            sessionId: request.sessionId,
            requestId: request.requestId,
          })
        })()
        const timeoutMs =
          typeof timeoutValue === 'number' &&
          Number.isSafeInteger(timeoutValue) &&
          timeoutValue > 0 &&
          timeoutValue <= 60_000
            ? timeoutValue
            : 15_000
        result = await runWithTimeout(pipeline, timeoutMs, () => {
          timedOut = true
        })
      } catch (error) {
        const message = safeErrorMessage(error)
        if (!mutationMayHaveStarted) {
          set(
            ledgerSourceAtom,
            Object.freeze(
              get(ledgerSourceAtom).filter((entry) => entry.operationId !== operationId),
            ),
          )
          const current = get(sourceAtom)
          const ownsCurrent = matchesOwnedState(current, request)
          if (ownsCurrent) {
            set(sourceAtom, {
              ...current,
              phase: 'error-open',
              requestId: null,
              pending: false,
              error: message,
            } as State)
          }
          releaseLaunch()
          return ownsCurrent ? 'error-open' : 'stale'
        }
        set(
          ledgerSourceAtom,
          settleLedger(get(ledgerSourceAtom), operationId, 'outcome-unknown', message),
        )
        const current = get(sourceAtom)
        if (matchesOwnedState(current, request)) {
          set(sourceAtom, {
            ...current,
            phase: 'outcome-unknown-blocked',
            pending: false,
            error: message,
          } as State)
        }
        releaseLaunch()
        return 'outcome-unknown'
      }

      updateLaunch({ sensitive: true })
      let snapshot: ReturnType<typeof snapshotLocalAcknowledgement>
      try {
        snapshot = snapshotLocalAcknowledgement(result, request)
      } finally {
        updateLaunch({ sensitive: false })
      }
      if (wasReentered() || snapshot.acknowledgement === null) {
        const message = wasReentered()
          ? 'Format save acknowledgement triggered a reentrant dispatch'
          : (snapshot.error ?? 'Format save acknowledgement was invalid')
        set(
          ledgerSourceAtom,
          settleLedger(get(ledgerSourceAtom), operationId, 'outcome-unknown', message),
        )
        const current = get(sourceAtom)
        if (matchesOwnedState(current, request)) {
          set(sourceAtom, {
            ...current,
            phase: 'outcome-unknown-blocked',
            pending: false,
            error: message,
          } as State)
        }
        releaseLaunch()
        return 'outcome-unknown'
      }

      set(ledgerSourceAtom, settleLedger(get(ledgerSourceAtom), operationId, 'local-acknowledged'))
      const current = get(sourceAtom)
      const ownsCurrent = matchesOwnedState(current, request)
      if (ownsCurrent) set(sourceAtom, { status: 'closed' } as State)
      releaseLaunch()
      return ownsCurrent ? 'local-acknowledged' : 'stale'
    },
  )

  return { runAtom, ledgerAtom, blockedAtom }
}
