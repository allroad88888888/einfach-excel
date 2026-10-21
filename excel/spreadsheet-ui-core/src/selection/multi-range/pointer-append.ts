import { atom, type Getter } from '@einfach/core'
import { projectionSnapshotBackingAtom } from '../../projection/state'
import { rustWorkbookConnectionAtom } from '../../runtime/workbook-connection'
import { activeWorkbookSheetAtom, type WorkbookDocumentSheet } from '../../runtime/workbook-document'
import { selectionStructureFeedbackAtom } from '../../toolbar/selection-structure-state'
import { workspaceActiveSheetAuthorityWitnessAtom, type WorkspaceActiveSheetAuthorityWitness } from '../../workspace'
import type { RustWorkbookConnection } from '../../rust-workbook'
import {
  getSelectionRange, MAX_SELECTION_REGIONS, normalizeSelection, selectionAuthorityWitnessAtom,
  selectionBoundsAtom, setMultiRegionSelectionAtom, setMultiRegionSelectionWithAuthorityReceiptAtom,
  type SelectionAuthorityReceipt, type SelectionState,
} from '../index'
import { projectMergedSelection } from '../merged-selection'

const LIMIT_MESSAGE = 'Selection area limit reached. Keep the current selection or start a new selection.'

interface AppendSession {
  readonly witness: SelectionAuthorityReceipt['witness']
  readonly regionCount: number
  readonly ownsRegion: boolean
  readonly workspace: WorkspaceActiveSheetAuthorityWitness
  readonly connection: RustWorkbookConnection | null
  readonly sheet: WorkbookDocumentSheet | null
}

// This is a drag ownership receipt, never a second copy of the selected regions.
const appendSessionAtom = atom<AppendSession | null>(null)
const feedbackAtom = atom('')
export const multiRangeSelectionFeedbackAtom = atom((get) => get(feedbackAtom))
multiRangeSelectionFeedbackAtom.debugLabel = 'spreadsheet.selection.multiRange.feedback'

export type AppendPointerOutcome =
  | { readonly status: 'applied'; readonly receipt: SelectionAuthorityReceipt }
  | { readonly status: 'ignored'; readonly reason: 'invalid' | 'area-limit' | 'selection-changed' }

function sameArea(get: Getter, left: SelectionState, right: SelectionState): boolean {
  if (left.sheetId !== right.sheetId) return false
  const bounds = get(selectionBoundsAtom)
  const a = getSelectionRange(left, bounds)
  const b = getSelectionRange(right, bounds)
  return a.rowStart === b.rowStart && a.rowEnd === b.rowEnd &&
    a.colStart === b.colStart && a.colEnd === b.colEnd
}

function sessionIsCurrent(get: Getter, session: AppendSession): boolean {
  return session.witness === get(selectionAuthorityWitnessAtom) &&
    session.regionCount === get(setMultiRegionSelectionAtom).regions.length &&
    session.workspace === get(workspaceActiveSheetAuthorityWitnessAtom) &&
    session.connection === get(rustWorkbookConnectionAtom) &&
    session.sheet === get(activeWorkbookSheetAtom) && !get(selectionStructureFeedbackAtom).busy
}

function normalizedRegion(get: Getter, region: SelectionState): SelectionState {
  return projectMergedSelection({
    regions: [normalizeSelection(region, get(selectionBoundsAtom))], primaryIndex: 0,
  }, get(projectionSnapshotBackingAtom).result).regions[0]
}

/** One modifier gesture owns only its newly appended primary region. */
export const appendPointerRegionAtom = atom(null, (get, set, input: {
  readonly phase: 'start' | 'update'
  readonly region: SelectionState
}): AppendPointerOutcome => {
  const candidate = input.region
  if ((candidate.kind !== 'cell' && candidate.kind !== 'range') ||
    ![candidate.anchor.row, candidate.anchor.col, candidate.focus.row, candidate.focus.col]
      .every(Number.isSafeInteger)) return { status: 'ignored', reason: 'invalid' }
  const session = get(appendSessionAtom)
  const multi = get(setMultiRegionSelectionAtom)
  if (get(selectionStructureFeedbackAtom).busy || (input.phase === 'update' &&
    (!session || !sessionIsCurrent(get, session)))) {
    set(appendSessionAtom, null)
    return { status: 'ignored', reason: 'selection-changed' }
  }
  const region = normalizedRegion(get, input.region)
  // Foreign-sheet regions cannot be introduced by a local pointer gesture.
  if (multi.regions.some((existing) => existing.sheetId !== region.sheetId))
    return { status: 'ignored', reason: 'invalid' }
  const regions = multi.regions.slice()
  const replacing = input.phase === 'update' && session?.ownsRegion
  let primaryIndex = replacing ? multi.primaryIndex
    : regions.findIndex((existing) => sameArea(get, existing, region))
  let ownsRegion = Boolean(replacing)
  if (replacing) regions[primaryIndex] = region
  else if (primaryIndex < 0) {
    // Reserve by rectangle count; never expand a rectangle into individual cells.
    if (regions.length >= MAX_SELECTION_REGIONS) {
      set(feedbackAtom, LIMIT_MESSAGE)
      set(appendSessionAtom, null)
      return { status: 'ignored', reason: 'area-limit' }
    }
    primaryIndex = regions.length
    regions.push(region)
    ownsRegion = true
  }
  const receipt = set(setMultiRegionSelectionWithAuthorityReceiptAtom, { regions, primaryIndex })
  if (!receipt) return { status: 'ignored', reason: 'invalid' }
  set(feedbackAtom, '')
  set(appendSessionAtom, {
    witness: receipt.witness, regionCount: regions.length, ownsRegion,
    workspace: get(workspaceActiveSheetAuthorityWitnessAtom),
    connection: get(rustWorkbookConnectionAtom), sheet: get(activeWorkbookSheetAtom),
  })
  return { status: 'applied', receipt }
})

/** Finish keeps the last valid selection and coalesces only identical rectangles. */
export const finishAppendPointerAtom = atom(null, (get, set): void => {
  const session = get(appendSessionAtom)
  set(appendSessionAtom, null)
  if (!session || !sessionIsCurrent(get, session)) return
  const multi = get(setMultiRegionSelectionAtom)
  const primary = multi.regions[multi.primaryIndex]
  const regions = multi.regions.filter((region, index) =>
    index === multi.primaryIndex || !sameArea(get, region, primary))
  if (regions.length === multi.regions.length) return
  // Retain the gesture's region object, including reversed anchor/focus direction.
  set(setMultiRegionSelectionWithAuthorityReceiptAtom, {
    regions, primaryIndex: regions.indexOf(primary),
  })
})

/** A new ordinary/Shift/reference gesture supersedes any previous append receipt. */
export const resetAppendPointerAtom = atom(null, (_get, set): void => {
  set(appendSessionAtom, null)
  set(feedbackAtom, '')
})
