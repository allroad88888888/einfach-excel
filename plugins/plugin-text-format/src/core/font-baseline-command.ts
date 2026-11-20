import { atom } from '@einfach/core'
import {
  applySelectionFormatAtom, editingSessionAtom, rustWorkbookConnectionAtom,
  type FontBaseline, type RustWorkbookConnection,
} from '@einfach-excel/spreadsheet-ui-core'

export interface FontBaselineFeedback {
  readonly busy: boolean
  readonly error: 'blocked' | 'unconfirmed' | null
}

const IDLE: FontBaselineFeedback = { busy: false, error: null }
const feedbackBackingAtom = atom<FontBaselineFeedback & {
  readonly connection: RustWorkbookConnection | null
}>({ ...IDLE, connection: null })

/** Feedback belongs to this plugin in this store and the current workbook connection. */
export const fontBaselineFeedbackAtom = atom<FontBaselineFeedback>((get) => {
  const feedback = get(feedbackBackingAtom)
  return feedback.connection === get(rustWorkbookConnectionAtom)
    ? { busy: feedback.busy, error: feedback.error } : IDLE
})

export const runFontBaselineAtom = atom(null, async (get, set, value: FontBaseline | 'dismiss') => {
  if (get(fontBaselineFeedbackAtom).busy) return false
  const connection = get(rustWorkbookConnectionAtom)
  if (value === 'dismiss') {
    set(feedbackBackingAtom, { ...IDLE, connection })
    return true
  }
  if (!connection || get(editingSessionAtom).source) return false
  const pending = { busy: true, error: null, connection }
  set(feedbackBackingAtom, pending)
  const response = set(applySelectionFormatAtom, { type: 'font-baseline', value })
  await Promise.resolve()
  if (get(feedbackBackingAtom) === pending) set(feedbackBackingAtom, pending)
  const outcome = await response
  if (get(feedbackBackingAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection)
    return false
  const completed = outcome === 'completed' || outcome === 'superseded'
  set(feedbackBackingAtom, {
    connection, busy: false,
    error: completed ? null : outcome === 'blocked' ? 'blocked' : 'unconfirmed',
  })
  return completed
})
feedbackBackingAtom.debugLabel = 'plugin.textFormat.fontBaselineFeedbackBacking'
fontBaselineFeedbackAtom.debugLabel = 'plugin.textFormat.fontBaselineFeedback'
runFontBaselineAtom.debugLabel = 'plugin.textFormat.runFontBaseline'
