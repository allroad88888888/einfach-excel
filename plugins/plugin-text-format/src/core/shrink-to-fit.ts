import { atom } from '@einfach/core'
import {
  activeCellFactAtom, applySelectionFormatAtom, editingSessionAtom, rustWorkbookConnectionAtom,
  textShrinkBlockedReason, type RustWorkbookConnection,
} from '@einfach-excel/spreadsheet-ui-core'

export interface ShrinkToFitFeedback {
  readonly busy: boolean
  readonly error: 'blocked' | 'unconfirmed' | null
}
const IDLE: ShrinkToFitFeedback = { busy: false, error: null }
const feedbackBackingAtom = atom<ShrinkToFitFeedback & {
  readonly connection: RustWorkbookConnection | null
}>({ ...IDLE, connection: null })

export const shrinkToFitFeedbackAtom = atom<ShrinkToFitFeedback>((get) => {
  const feedback = get(feedbackBackingAtom)
  return feedback.connection === get(rustWorkbookConnectionAtom)
    ? { busy: feedback.busy, error: feedback.error } : IDLE
})

/** Enabling shrink clears wrapping; only active shrink cells with blocked layouts need a note. */
export const shrinkToFitNoteAtom = atom((get) => {
  const cell = get(activeCellFactAtom)
  const active = Boolean(cell?.format?.shrinkToFit || cell?.format?.overflow === 'shrink-to-fit')
  if (!active) return null
  return textShrinkBlockedReason({ ...cell?.format, wrap: false, overflow: undefined },
    cell?.displayValue ?? '')
})

export const runShrinkToFitAtom = atom(null, async (get, set, value: boolean | 'dismiss') => {
  if (get(shrinkToFitFeedbackAtom).busy) return false
  const connection = get(rustWorkbookConnectionAtom)
  if (value === 'dismiss') {
    set(feedbackBackingAtom, { ...IDLE, connection })
    return true
  }
  if (!connection || get(editingSessionAtom).source) return false
  const pending = { busy: true, error: null, connection }
  set(feedbackBackingAtom, pending)
  const response = set(applySelectionFormatAtom, { type: 'shrink-to-fit', value })
  await Promise.resolve()
  if (get(feedbackBackingAtom) === pending) set(feedbackBackingAtom, pending)
  const outcome = await response
  if (get(feedbackBackingAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection)
    return false
  const completed = outcome === 'completed' || outcome === 'superseded'
  set(feedbackBackingAtom, { connection, busy: false,
    error: completed ? null : outcome === 'blocked' ? 'blocked' : 'unconfirmed' })
  return completed
})
feedbackBackingAtom.debugLabel = 'plugin.textFormat.shrinkToFitFeedbackBacking'
shrinkToFitFeedbackAtom.debugLabel = 'plugin.textFormat.shrinkToFitFeedback'
shrinkToFitNoteAtom.debugLabel = 'plugin.textFormat.shrinkToFitNote'
runShrinkToFitAtom.debugLabel = 'plugin.textFormat.runShrinkToFit'
