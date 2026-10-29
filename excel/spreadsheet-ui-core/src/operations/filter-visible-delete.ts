import { atom } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import { getFilterHiddenRowsForSheet, viewportFilterHiddenAtom } from '../viewport/effective-hidden'
import { createDeleteRowsOperation } from './intent-factories'
import type { SpreadsheetOperationSource } from './intent-types'
import type {
  StructureOperationCommandOutcome,
  StructureOperationControllerPort,
} from './structure-contract'
import { runStructureOperation } from './structure-run'

// ---------------------------------------------------------------------------
// Delete rows over a filtered region (§8.3)
// ---------------------------------------------------------------------------

/** One contiguous `delete-rows` span, in the shape the backend request takes. */
export interface RowDeletionRun {
  readonly rowIndex: number
  readonly count: number
}

export interface PlanFilterVisibleRowDeletionsInput {
  /** First row of the user's contiguous selection. */
  readonly rowIndex: number
  /** How many rows the selection covers. `< 1` plans nothing. */
  readonly count: number
  /**
   * FILTER-hidden rows for the sheet. NOT the manual ∪ filter union —
   * manually hidden rows inside a deleted span are deleted along with the
   * visible ones, which is both Excel's behaviour and today's behaviour.
   * Omitted / empty plans the span verbatim.
   */
  readonly filterHiddenRows?: ReadonlySet<number> | readonly number[]
}

/**
 * Split a contiguous row selection into the `delete-rows` spans that
 * actually remove data, dropping rows the active filter has hidden.
 *
 * Excel semantics (§8.3): with an AutoFilter active, deleting a selected
 * row span removes only the VISIBLE rows — filtered-out rows inside the
 * span survive. This is the same asymmetry copy has: filtered-out rows are
 * skipped implicitly, manually hidden rows are not. Verified against
 * Microsoft Q&A moderator answers, not against a normative Microsoft doc —
 * see the commit message for citations and the confidence caveat.
 *
 * Contract:
 *
 * 1. Runs come back in DESCENDING row order. Deleting a higher run first
 *    leaves every lower run's index untouched, so a caller can apply them
 *    one at a time against a backend that shifts indices on each delete
 *    without remapping anything. Applying them ascending would corrupt
 *    every run after the first.
 * 2. Each run is maximal — adjacent visible rows never split into two runs,
 *    so the caller issues the fewest possible backend transactions.
 * 3. An empty result means "nothing to delete": either the input was
 *    malformed or every row in the span was filter-hidden. Callers must
 *    launch zero transport in that case, never fall back to the raw span.
 *
 * Why this is an identity today: under display compaction a filtered-out
 * row has no display slot, so `filterHiddenRows` is always empty and the
 * result is always the single input span. The guard only starts doing work
 * after the S5 adapter flip gives filter-hidden rows real indices inside
 * the selection.
 */
export function planFilterVisibleRowDeletions(
  input: PlanFilterVisibleRowDeletionsInput,
): readonly RowDeletionRun[] {
  const rowIndex = input?.rowIndex
  const count = input?.count
  if (
    !Number.isSafeInteger(rowIndex) ||
    rowIndex < 0 ||
    !Number.isSafeInteger(count) ||
    count < 1
  ) {
    return []
  }

  const hidden =
    input.filterHiddenRows instanceof Set
      ? input.filterHiddenRows
      : new Set(input.filterHiddenRows ?? [])

  const endRow = rowIndex + count - 1
  if (hidden.size === 0) {
    return Object.freeze([Object.freeze({ rowIndex, count })])
  }

  // Walk ascending to find maximal visible runs, then reverse — building
  // descending directly would need the same two passes with worse locality.
  const runs: RowDeletionRun[] = []
  let runStart = -1
  for (let row = rowIndex; row <= endRow; row += 1) {
    if (!hidden.has(row)) {
      if (runStart === -1) runStart = row
      continue
    }
    if (runStart !== -1) {
      runs.push(Object.freeze({ rowIndex: runStart, count: row - runStart }))
      runStart = -1
    }
  }
  if (runStart !== -1) {
    runs.push(Object.freeze({ rowIndex: runStart, count: endRow - runStart + 1 }))
  }

  runs.reverse()
  return Object.freeze(runs)
}

export type FilterVisibleRowDeleteOutcome =
  | StructureOperationCommandOutcome
  /** Every row in the selection was filter-hidden; no transport was launched. */
  | 'no-visible-rows'

export interface RunFilterVisibleRowDeleteInput {
  readonly sheetId: string
  readonly rowIndex: number
  readonly count: number
  readonly source: StructureOperationControllerPort
  readonly refreshProjection: (sheetId: string) => Promise<void>
  readonly historyEntryRecorder: HistoryEntryRecorder
  readonly timeoutMs?: number
  readonly operationSource?: SpreadsheetOperationSource
  readonly revision?: number | string
}

/**
 * Delete a contiguous row selection, skipping filter-hidden rows (§8.3).
 *
 * Dispatches one `runStructureOperationAtom` per planned run, highest run
 * first (see {@link planFilterVisibleRowDeletions}), and stops at the first
 * run that does not complete — the caller sees that run's outcome and
 * `structureOperationLifecycleAtom` carries its error. A partial failure
 * leaves the already-deleted higher runs deleted; each run is its own
 * history entry, exactly as N separate delete commands would be, so undo
 * still unwinds them one at a time.
 *
 * With no filter active this issues exactly one operation with exactly the
 * requested span — byte-identical to calling `runStructureOperationAtom`
 * with `createDeleteRowsOperation` directly, which is what every caller did
 * before this existed.
 */
export const runFilterVisibleRowDeleteAtom = atom(
  null,
  async (
    get,
    set,
    input: RunFilterVisibleRowDeleteInput,
  ): Promise<FilterVisibleRowDeleteOutcome> => {
    const sheetId = typeof input?.sheetId === 'string' ? input.sheetId : ''
    if (!sheetId) return 'rejected'

    const runs = planFilterVisibleRowDeletions({
      rowIndex: input.rowIndex,
      count: input.count,
      filterHiddenRows: getFilterHiddenRowsForSheet(get(viewportFilterHiddenAtom), sheetId),
    })
    if (runs.length === 0) {
      // Malformed span, or the whole selection is filter-hidden. Either way
      // the one thing we must not do is delete the raw span.
      return input.count >= 1 && Number.isSafeInteger(input.rowIndex) && input.rowIndex >= 0
        ? 'no-visible-rows'
        : 'rejected'
    }

    let outcome: StructureOperationCommandOutcome = 'completed'
    for (const run of runs) {
      outcome = await runStructureOperation(get, set, {
        intent: createDeleteRowsOperation({
          sheetId,
          rowIndex: run.rowIndex,
          count: run.count,
          source: input.operationSource,
          revision: input.revision,
        }),
        source: input.source,
        refreshProjection: input.refreshProjection,
        historyEntryRecorder: input.historyEntryRecorder,
        timeoutMs: input.timeoutMs,
      })
      if (outcome !== 'completed') return outcome
    }
    return outcome
  },
)
runFilterVisibleRowDeleteAtom.debugLabel =
  'spreadsheet.operations.structure.deleteFilterVisibleRows'
