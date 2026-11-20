import { atom } from '@einfach/core'
import {
  copyWorksheetCriteriaAtom, nativeFilterFeedbackAtom, runWorksheetCriteriaAtom,
  worksheetCriteriaContextAtom, type WorksheetCriteriaContext, type WorksheetCriteriaDraft,
  type WorksheetCriteriaPreview,
} from '@einfach-excel/spreadsheet-ui-core'

interface Panel {
  readonly context: WorksheetCriteriaContext
  readonly draft: WorksheetCriteriaDraft
  readonly mode: 'in-place' | 'copy'
  readonly busy: boolean
  readonly preview: WorksheetCriteriaPreview | null
  readonly confirmOverwrite: boolean
  readonly error: string | null
}

type Action = 'open' | 'close' | 'submit'
  | { readonly type: 'draft'; readonly patch: Partial<WorksheetCriteriaDraft> }
  | { readonly type: 'mode'; readonly mode: Panel['mode'] }
  | { readonly type: 'overwrite'; readonly value: boolean }

const stateAtom = atom<Panel | null>(null)

export const worksheetCriteriaPanelAtom = atom((get) => {
  const panel = get(stateAtom)
  const context = get(worksheetCriteriaContextAtom)
  return panel && context?.connection === panel.context.connection &&
    context.sheetId === panel.context.sheetId
    ? panel : null
})

export const configureWorksheetCriteriaAtom = atom(null, async (get, set, action: Action) => {
  const panel = get(worksheetCriteriaPanelAtom)
  if (panel?.busy || get(nativeFilterFeedbackAtom).busy) return false
  if (action === 'open') {
    const context = get(worksheetCriteriaContextAtom)
    if (panel || !context || context.editing) return false
    set(stateAtom, {
      context, mode: 'in-place', busy: false, preview: null, error: null, confirmOverwrite: false,
      draft: { source: context.source, criteria: '', destination: '', outputFields: '', uniqueOnly: false },
    })
    return true
  }
  if (action === 'close') {
    set(stateAtom, null)
    return true
  }
  if (!panel) return false
  if (typeof action === 'object') {
    if (action.type === 'overwrite') set(stateAtom, { ...panel, confirmOverwrite: action.value })
    else set(stateAtom, {
      ...panel, mode: action.type === 'mode' ? action.mode : panel.mode,
      draft: action.type === 'draft' ? { ...panel.draft, ...action.patch } : panel.draft,
      preview: null, error: null, confirmOverwrite: false,
    })
    return true
  }

  const pending = { ...panel, busy: true, error: null }
  set(stateAtom, pending)
  try {
    const request = panel.preview ? set(copyWorksheetCriteriaAtom, {
      preview: panel.preview, confirmOverwrite: panel.confirmOverwrite,
    }).then(() => null) : set(runWorksheetCriteriaAtom, {
      mode: panel.mode === 'copy' ? 'preview-copy' : 'in-place', draft: panel.draft,
    })
    await Promise.resolve()
    if (get(worksheetCriteriaPanelAtom) === pending) set(stateAtom, pending)
    const preview = await request
    if (get(worksheetCriteriaPanelAtom) !== pending) {
      if (get(stateAtom) === pending) set(stateAtom, null)
      return false
    }
    set(stateAtom, preview ? { ...pending, busy: false, preview, confirmOverwrite: false } : null)
    return true
  } catch (error) {
    if (get(worksheetCriteriaPanelAtom) !== pending) {
      if (get(stateAtom) === pending) set(stateAtom, null)
      return false
    }
    set(stateAtom, { ...pending, busy: false, preview: null, confirmOverwrite: false,
      error: error instanceof Error ? error.message : 'Could not apply advanced filter.' })
    return false
  }
})
stateAtom.debugLabel = 'plugin.dataFilter.worksheetCriteriaState'
worksheetCriteriaPanelAtom.debugLabel = 'plugin.dataFilter.worksheetCriteriaPanel'
configureWorksheetCriteriaAtom.debugLabel = 'plugin.dataFilter.configureWorksheetCriteria'
