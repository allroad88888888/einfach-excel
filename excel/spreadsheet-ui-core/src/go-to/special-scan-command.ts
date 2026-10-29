import { atom } from '@einfach/core'
import type { RangeProjectionRequest, RangeProjectionResult } from '../backend'
import { selectionAuthorityWitnessAtom, selectionSnapshotAtom } from '../selection'
import { sheetTabsSheetsAtom } from '../sheet-tabs'
import { effectiveHiddenAtom, viewportMetricsAtom } from '../viewport'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'
import { nextGoToSpecialRequestId } from './identity'
import { runGoToSpecialScan } from './locator-engine'
import { goToSpecialLaunchIsCurrent, goToSpecialTicketIsCurrent } from './scan-currency'
import {
  cellIsInsideRange,
  clipGoToScanRange,
  computeGoToScanRange,
  projectionMatchesRequest,
  sameRange,
  toGoToCandidate,
} from './scan-range'
import { applyGoToSpecialResultAtom } from './selection-commands'
import { closeGoToAtom } from './session-commands'
import {
  EMPTY_GO_TO_ERROR,
  IDLE_SPECIAL_SCAN,
  goToErrorStateAtom,
  goToLocatorAtom,
  goToModeAtom,
  goToOpenAtom,
  goToSessionSequenceAtom,
  goToSpecialCapabilityStateAtom,
  goToSpecialRequestSequenceAtom,
  goToSpecialReservationAtom,
  goToSpecialScanStateAtom,
  goToSpecialWarningStateAtom,
  type GoToSpecialScanState,
} from './session-state'
import {
  GO_TO_REGION_CAP,
  GO_TO_SCAN_MAX_CELLS,
  type GoToSpecialWarning,
  type RunGoToSpecialScanInput,
} from './types'
import {
  errorMessage,
  explicitSpecialError,
  snapshotLocator,
  unavailableSpecialError,
} from './value-snapshots'

/**
 * Owns the complete async Go To Special scan lifecycle. The framework adapter
 * supplies only the projection port; request/session authority, scan scope,
 * locator evaluation, stale-result rejection, selection commit and visible
 * warning/error state all remain in Core.
 */
export const runGoToSpecialScanAtom = atom(
  null,
  async (get, set, input: RunGoToSpecialScanInput): Promise<void> => {
    const sessionId = get(goToSessionSequenceAtom)
    const workspaceWitness = get(workspaceActiveSheetAuthorityWitnessAtom)
    const launchSelectionWitness = get(selectionAuthorityWitnessAtom)
    const existingReservation = get(goToSpecialReservationAtom)
    if (
      existingReservation !== null &&
      existingReservation.sessionId === sessionId &&
      existingReservation.workspaceWitness === workspaceWitness &&
      existingReservation.selectionWitness === launchSelectionWitness
    ) {
      return
    }
    if (!get(goToOpenAtom) || get(goToModeAtom) !== 'special') return

    const reservation = Object.freeze({
      sessionId,
      workspaceWitness,
      selectionWitness: launchSelectionWitness,
    })
    set(goToSpecialReservationAtom, reservation)

    try {
      const readRangeProjection = input?.port?.readRangeProjection
      if (typeof readRangeProjection !== 'function') {
        set(goToSpecialCapabilityStateAtom, 'unavailable')
        if (goToSpecialLaunchIsCurrent(get, sessionId, workspaceWitness, launchSelectionWitness)) {
          set(goToErrorStateAtom, unavailableSpecialError())
        }
        return
      }
      set(goToSpecialCapabilityStateAtom, 'available')

      const workspace = get(workspaceSessionAtom)
      const sheets = get(sheetTabsSheetsAtom)
      const selection = get(selectionSnapshotAtom)
      const selectionWitness = get(selectionAuthorityWitnessAtom)
      if (selectionWitness !== launchSelectionWitness) return
      const sheetId = workspace.activeSheetId ?? selection.selection.sheetId ?? sheets[0]?.id ?? ''
      if (sheetId.length === 0) {
        if (goToSpecialLaunchIsCurrent(get, sessionId, workspaceWitness, launchSelectionWitness)) {
          set(
            goToErrorStateAtom,
            explicitSpecialError(
              'goTo.error.noActiveSheet',
              'Go To Special needs an active worksheet.',
            ),
          )
        }
        return
      }

      const locator = snapshotLocator(get(goToLocatorAtom))
      const selectionRange = selection.range
      const differenceLocator =
        locator.kind === 'row-differences' || locator.kind === 'column-differences'
      const metrics = get(viewportMetricsAtom)
      const unclippedRange = differenceLocator
        ? selectionRange
        : computeGoToScanRange(metrics.rowCount, metrics.colCount)
      const range = clipGoToScanRange(unclippedRange)
      const rangeWasClipped = !sameRange(range, unclippedRange)
      const requestId = nextGoToSpecialRequestId(get(goToSpecialRequestSequenceAtom))
      if (requestId === null) {
        if (goToSpecialLaunchIsCurrent(get, sessionId, workspaceWitness, launchSelectionWitness)) {
          set(
            goToErrorStateAtom,
            explicitSpecialError(
              'goTo.error.identityExhausted',
              'Go To Special cannot scan because its request identity space is exhausted.',
            ),
          )
        }
        return
      }
      set(goToSpecialRequestSequenceAtom, requestId)
      const request: RangeProjectionRequest = Object.freeze({
        kind: 'range',
        sheetId,
        range: Object.freeze({ ...range }),
        requestId,
        reason: 'diagnostics',
      })
      const scanState: GoToSpecialScanState = Object.freeze({
        status: 'scanning',
        sessionId,
        requestId,
        sheetId,
        locator,
        workspaceWitness,
        selectionWitness,
      })
      set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
      set(goToSpecialWarningStateAtom, null)
      set(goToSpecialScanStateAtom, scanState)

      let projection: RangeProjectionResult
      try {
        projection = await readRangeProjection.call(input.port, request)
      } catch (error) {
        if (goToSpecialTicketIsCurrent(get, scanState, workspaceWitness, selectionWitness)) {
          set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
          set(
            goToErrorStateAtom,
            explicitSpecialError(
              'goTo.error.scanFailed',
              `Go To Special could not read the worksheet: ${errorMessage(error)}`,
            ),
          )
        }
        return
      }

      if (!goToSpecialTicketIsCurrent(get, scanState, workspaceWitness, selectionWitness)) {
        return
      }
      if (!projectionMatchesRequest(projection, request)) {
        set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
        set(
          goToErrorStateAtom,
          explicitSpecialError(
            'goTo.error.projectionMismatch',
            'Go To Special received a projection for a different request or worksheet.',
          ),
        )
        return
      }

      if (projection.truncated === true) {
        // Sparse absence only means "blank" when the projection is complete.
        // A backend-truncated payload can omit occupied cells, so running any
        // locator (especially blanks/region/difference locators) could commit a
        // false selection. Fail closed until a complete continuation exists.
        set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
        set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
        set(
          goToSpecialWarningStateAtom,
          Object.freeze({ reason: 'cells', limit: GO_TO_SCAN_MAX_CELLS }),
        )
        return
      }

      const incompleteResultMustFailClosed =
        rangeWasClipped &&
        (differenceLocator || locator.kind === 'last-cell' || locator.kind === 'current-region')
      if (incompleteResultMustFailClosed) {
        // Difference locators need every cell in the selected rect, while
        // last-cell/current-region need the complete worksheet scan scope.
        // A clipped request cannot produce an exact result for those locators.
        set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
        set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
        set(
          goToSpecialWarningStateAtom,
          Object.freeze({ reason: 'cells', limit: GO_TO_SCAN_MAX_CELLS }),
        )
        return
      }

      // Union (manual ∪ filter): `Go To Special → Visible cells only` asks a
      // pure visibility question, and a row is invisible whichever set put it
      // there. Excluding filter-hidden rows here is what keeps the locator
      // from selecting rows the user cannot see.
      const hidden = get(effectiveHiddenAtom)
      const activeCell = differenceLocator
        ? {
            row: range.rowStart,
            col: range.colStart,
          }
        : selection.activeCell
      const scan = runGoToSpecialScan(locator, {
        sheetId,
        activeCell,
        cells: projection.cells
          .filter((cell) => cellIsInsideRange(cell, range))
          .map(toGoToCandidate),
        searchRect: range,
        selectionRect: differenceLocator ? range : selectionRange,
        hiddenRows: hidden.rowsBySheet[sheetId] ?? [],
        hiddenCols: hidden.colsBySheet[sheetId] ?? [],
      })

      if (!goToSpecialTicketIsCurrent(get, scanState, workspaceWitness, selectionWitness)) {
        return
      }
      const warning: GoToSpecialWarning | null = scan.truncated
        ? Object.freeze({ reason: 'regions', limit: GO_TO_REGION_CAP })
        : rangeWasClipped
          ? Object.freeze({ reason: 'cells', limit: GO_TO_SCAN_MAX_CELLS })
          : null
      if (scan.totalMatchCount === 0) {
        set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
        if (warning !== null) {
          // A bounded projection cannot prove that the locator has no matches.
          // Keep the current selection and leave the dialog open with an explicit
          // incomplete-scan witness instead of reporting a definitive no-match.
          set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
          set(goToSpecialWarningStateAtom, warning)
          return
        }
        set(
          goToErrorStateAtom,
          Object.freeze({
            code: 'goTo.error.noMatches',
            params: null,
            message: null,
          }),
        )
        return
      }

      set(applyGoToSpecialResultAtom, { result: scan, sheetId })
      set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
      set(goToErrorStateAtom, EMPTY_GO_TO_ERROR)
      if (warning !== null) {
        set(goToSpecialWarningStateAtom, warning)
        return
      }
      set(closeGoToAtom)
    } catch (error) {
      if (goToSpecialLaunchIsCurrent(get, sessionId, workspaceWitness, launchSelectionWitness)) {
        set(goToSpecialScanStateAtom, IDLE_SPECIAL_SCAN)
        set(
          goToErrorStateAtom,
          explicitSpecialError(
            'goTo.error.scanFailed',
            `Go To Special could not complete the scan: ${errorMessage(error)}`,
          ),
        )
      }
    } finally {
      if (get(goToSpecialReservationAtom) === reservation) {
        set(goToSpecialReservationAtom, null)
      }
    }
  },
)
runGoToSpecialScanAtom.debugLabel = 'spreadsheet.goTo.runSpecialScan'
