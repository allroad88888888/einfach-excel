import { atom } from '@einfach/core'
import { setMultiRegionSelectionAtom, setSelectionAtom, type SelectionRegion } from '../selection'
import { goToErrorAtom } from './session-state'
import { closeGoToAtom, pushGoToHistoryAtom } from './session-commands'
import type { GoToScanResult, GoToTarget } from './types'

/**
 * Apply a parsed Go To target to the workbook selection. Single-cell targets
 * route through `setSelectionAtom` as a 'cell' selection; range targets as
 * 'range'. The dialog calls this from its commit handler after parsing.
 */
export const applyGoToTargetAtom = atom(null, (_get, set, target: GoToTarget) => {
  if (target.range) {
    const r = target.range
    if (r.rowStart === r.rowEnd && r.colStart === r.colEnd) {
      set(setSelectionAtom, {
        kind: 'cell',
        sheetId: target.sheetId,
        anchor: { row: r.rowStart, col: r.colStart },
        focus: { row: r.rowStart, col: r.colStart },
      })
    } else {
      set(setSelectionAtom, {
        kind: 'range',
        sheetId: target.sheetId,
        anchor: { row: r.rowStart, col: r.colStart },
        focus: { row: r.rowEnd, col: r.colEnd },
      })
    }
    return
  }
  if (target.coord) {
    set(setSelectionAtom, {
      kind: 'cell',
      sheetId: target.sheetId,
      anchor: target.coord,
      focus: target.coord,
    })
  }
})
applyGoToTargetAtom.debugLabel = 'spreadsheet.goTo.applyTarget'

/**
 * Surface a Go To Special locator scan as the workbook selection. Routes
 * through `setMultiRegionSelectionAtom` so N matches emit a single atom
 * notification — adding regions one-by-one with `addSelectionRegionAtom`
 * would notify subscribers N times and trigger O(N) re-renders.
 *
 * Empty scans collapse to a single-cell selection at (0,0) of the source
 * sheet (the multi-region setter's fallback) so the active cell remains
 * defined. Use the scan's `totalMatchCount === 0` to flag "no cells found".
 */
export const applyGoToSpecialResultAtom = atom(
  null,
  (_get, set, input: { result: GoToScanResult; sheetId: string }) => {
    if (input.result.regions.length === 0) {
      set(setSelectionAtom, {
        kind: 'cell',
        sheetId: input.sheetId,
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 0 },
      })
      return
    }
    set(setMultiRegionSelectionAtom, {
      regions: input.result.regions as readonly SelectionRegion[],
      primaryIndex: 0,
    })
  },
)
applyGoToSpecialResultAtom.debugLabel = 'spreadsheet.goTo.applySpecialResult'

/**
 * High-level "confirm" command used by the dialog footer / Enter handler.
 *
 * Simple-mode parsing remains a pure adapter concern. Special-mode adapters
 * dispatch `runGoToSpecialScanAtom`; the pre-resolved `special-result` arm is
 * retained for compatibility with existing callers.
 *
 *   - `kind: 'simple-target'` → `applyGoToTargetAtom`
 *     History entry: caller-supplied (`historyEntry` field).
 *
 *   - `kind: 'special-result'` → `applyGoToSpecialResultAtom`
 *
 *   - `kind: 'parse-error'` → push the error code into `goToErrorAtom`
 *     and leave the dialog open.
 */
export type ConfirmGoToInput =
  | {
      kind: 'simple-target'
      target: GoToTarget
      historyEntry?: string
    }
  | {
      kind: 'special-result'
      sheetId: string
      result: GoToScanResult
    }
  | {
      kind: 'parse-error'
      code: string
    }

export const confirmGoToAtom = atom(null, (get, set, input: ConfirmGoToInput) => {
  switch (input.kind) {
    case 'simple-target':
      set(applyGoToTargetAtom, input.target)
      if (input.historyEntry !== undefined) {
        set(pushGoToHistoryAtom, input.historyEntry)
      }
      set(closeGoToAtom)
      return
    case 'special-result':
      set(applyGoToSpecialResultAtom, {
        result: input.result,
        sheetId: input.sheetId,
      })
      set(closeGoToAtom)
      return
    case 'parse-error':
      set(goToErrorAtom, input.code)
      return
  }
  // Compile-time exhaustiveness check — `get` is unused but referenced
  // so the closure type-checks against the readonly setter signature.
  void get
})
confirmGoToAtom.debugLabel = 'spreadsheet.goTo.confirm'
