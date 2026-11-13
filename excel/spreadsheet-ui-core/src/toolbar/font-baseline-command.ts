import { atom } from '@einfach/core'
import type { FontBaseline } from '../contracts'
import { editingSessionAtom } from '../editing/session-atoms'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { applySelectionFormatAtom } from './selection-format-command'

/** Only command feedback lives here; the active baseline comes from Rust's projection. */
export const fontBaselineFeedbackAtom = atom<{ busy: boolean; error: string | null }>({
  busy: false, error: null,
})

export const runFontBaselineAtom = atom(null, async (get, set, value: FontBaseline | 'dismiss') => {
  if (get(fontBaselineFeedbackAtom).busy) return false
  if (value === 'dismiss') {
    set(fontBaselineFeedbackAtom, { busy: false, error: null })
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection || get(editingSessionAtom).source) return false
  const pending = { busy: true, error: null }
  set(fontBaselineFeedbackAtom, pending)
  const response = set(applySelectionFormatAtom, { type: 'font-baseline', value })
  await Promise.resolve()
  if (get(fontBaselineFeedbackAtom) === pending) set(fontBaselineFeedbackAtom, pending)
  const outcome = await response
  if (get(fontBaselineFeedbackAtom) !== pending) return false
  if (get(rustWorkbookConnectionAtom) !== connection) {
    set(fontBaselineFeedbackAtom, { busy: false, error: null })
    return false
  }
  const completed = outcome === 'completed' || outcome === 'superseded'
  set(fontBaselineFeedbackAtom, {
    busy: false,
    error: completed ? null : outcome === 'blocked'
      ? 'Select an editable range and wait for the worksheet to finish loading.'
      : 'Could not confirm the font change. Check the cell before retrying.',
  })
  return completed
})
fontBaselineFeedbackAtom.debugLabel = 'spreadsheet.toolbar.fontBaselineFeedback'
runFontBaselineAtom.debugLabel = 'spreadsheet.toolbar.runFontBaseline'
