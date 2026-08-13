import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import type { CellCoord } from '../shared'
import {
  workspaceActiveSheetAuthorityWitnessAtom,
  workspaceSessionAtom,
  type WorkspaceActiveSheetAuthorityWitness,
} from '../workspace'

const MAX_SHEET_ID_LENGTH = 512

export interface LockedEditFeedback {
  readonly id: number
  readonly sheetId: string
  readonly cell: Readonly<CellCoord>
  readonly source: 'cell' | 'keyboard'
  /** Active-sheet epoch that made this rejection visible. */
  readonly activeSheetWitness: WorkspaceActiveSheetAuthorityWitness
}

export interface ReportLockedEditFeedbackInput {
  readonly sheetId: string
  readonly cell: Readonly<CellCoord>
  readonly source: 'cell' | 'keyboard'
}

export interface ClearLockedEditFeedbackForCellInput {
  readonly sheetId: string
  readonly cell: Readonly<CellCoord>
}

type LockedEditFeedbackInputSnapshot =
  | { readonly kind: 'valid'; readonly value: ReportLockedEditFeedbackInput }
  | { readonly kind: 'invalid' }

const lockedEditFeedbackStateAtom = atom<LockedEditFeedback | null>(null)
lockedEditFeedbackStateAtom.debugLabel = 'spreadsheet.editing.lockedEditFeedback.state'

const lockedEditFeedbackSequenceAtom = atom(0)
lockedEditFeedbackSequenceAtom.debugLabel = 'spreadsheet.editing.lockedEditFeedback.sequence'

function isSafeCellIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function snapshotReportInput(input: unknown): LockedEditFeedbackInputSnapshot {
  if (input === null || typeof input !== 'object') return { kind: 'invalid' }
  try {
    const record = input as Record<string, unknown>
    const sheetId = record.sheetId
    const source = record.source
    const cell = record.cell
    if (
      typeof sheetId !== 'string' ||
      sheetId.length === 0 ||
      sheetId.length > MAX_SHEET_ID_LENGTH ||
      (source !== 'cell' && source !== 'keyboard') ||
      cell === null ||
      typeof cell !== 'object'
    ) {
      return { kind: 'invalid' }
    }
    const cellRecord = cell as Record<string, unknown>
    if (!isSafeCellIndex(cellRecord.row) || !isSafeCellIndex(cellRecord.col)) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'valid',
      value: Object.freeze({
        sheetId,
        cell: Object.freeze({ row: cellRecord.row, col: cellRecord.col }),
        source,
      }),
    }
  } catch {
    return { kind: 'invalid' }
  }
}

function isCurrentFeedback(
  feedback: LockedEditFeedback,
  activeSheetId: string | null,
  activeSheetWitness: WorkspaceActiveSheetAuthorityWitness,
): boolean {
  return feedback.sheetId === activeSheetId && feedback.activeSheetWitness === activeSheetWitness
}

/**
 * The only readable feedback state. A sheet switch invalidates the captured
 * witness, including A → B → A, so an old rejection can never resurface.
 */
export const lockedEditFeedbackAtom: Atom<LockedEditFeedback | null> = atom((get) => {
  const feedback = get(lockedEditFeedbackStateAtom)
  if (feedback === null) return null
  return isCurrentFeedback(
    feedback,
    get(workspaceSessionAtom).activeSheetId,
    get(workspaceActiveSheetAuthorityWitnessAtom),
  )
    ? feedback
    : null
})
lockedEditFeedbackAtom.debugLabel = 'spreadsheet.editing.lockedEditFeedback'

/** Records a direct-edit refusal only for the currently authoritative sheet. */
export const reportLockedEditFeedbackAtom = atom(
  null,
  (get, set, input: ReportLockedEditFeedbackInput): LockedEditFeedback | null => {
    const snapshot = snapshotReportInput(input)
    if (snapshot.kind === 'invalid') return null
    const workspace = get(workspaceSessionAtom)
    const activeSheetWitness = get(workspaceActiveSheetAuthorityWitnessAtom)
    if (workspace.activeSheetId !== snapshot.value.sheetId) return null
    if (
      get(workspaceSessionAtom).activeSheetId !== snapshot.value.sheetId ||
      get(workspaceActiveSheetAuthorityWitnessAtom) !== activeSheetWitness
    ) {
      return null
    }
    const previousId = get(lockedEditFeedbackSequenceAtom)
    if (!Number.isSafeInteger(previousId) || previousId >= Number.MAX_SAFE_INTEGER) return null
    const feedback: LockedEditFeedback = Object.freeze({
      id: previousId + 1,
      sheetId: snapshot.value.sheetId,
      cell: snapshot.value.cell,
      source: snapshot.value.source,
      activeSheetWitness,
    })
    set(lockedEditFeedbackSequenceAtom, feedback.id)
    set(lockedEditFeedbackStateAtom, feedback)
    return feedback
  },
)
reportLockedEditFeedbackAtom.debugLabel = 'spreadsheet.editing.reportLockedEditFeedback'

/** Dismisses only the exact, still-authoritative feedback snapshot. */
export const dismissLockedEditFeedbackAtom = atom(
  null,
  (get, set, feedback: LockedEditFeedback): void => {
    const current = get(lockedEditFeedbackAtom)
    if (
      current === null ||
      feedback?.id !== current.id ||
      feedback.activeSheetWitness !== current.activeSheetWitness
    ) {
      return
    }
    set(lockedEditFeedbackStateAtom, null)
  },
)
dismissLockedEditFeedbackAtom.debugLabel = 'spreadsheet.editing.dismissLockedEditFeedback'

/** Clears a visible refusal when its exact cell successfully enters editing. */
export const clearLockedEditFeedbackForCellAtom = atom(
  null,
  (get, set, input: ClearLockedEditFeedbackForCellInput): void => {
    const snapshot = snapshotReportInput({ ...input, source: 'cell' })
    if (snapshot.kind === 'invalid') return
    const current = get(lockedEditFeedbackAtom)
    if (
      current === null ||
      current.sheetId !== snapshot.value.sheetId ||
      current.cell.row !== snapshot.value.cell.row ||
      current.cell.col !== snapshot.value.cell.col
    ) {
      return
    }
    set(lockedEditFeedbackStateAtom, null)
  },
)
clearLockedEditFeedbackForCellAtom.debugLabel = 'spreadsheet.editing.clearLockedEditFeedbackForCell'
