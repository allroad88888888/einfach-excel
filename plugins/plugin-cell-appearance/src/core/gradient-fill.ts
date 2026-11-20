import { atom } from '@einfach/core'
import { activeCellFormatAtom, applySelectionFormatAtom, editingSessionAtom, gradientColorAt,
  rustWorkbookConnectionAtom, selectionAuthorityWitnessAtom, selectionMutationFeedbackAtom,
  type RustWorkbookConnection, type SelectionAuthorityWitness } from '@einfach-excel/spreadsheet-ui-core'
import { gradientColorInput, gradientDraftFromFormat, gradientFromDraft, gradientNumericInput,
  type GradientDraft, type GradientEdge } from './gradient-draft'

interface GradientPanel {
  readonly open: boolean
  readonly draft: GradientDraft
  readonly busy: boolean
  readonly error: 'invalidGradient' | 'selection' | 'failed' | null
}
const initial: GradientPanel = {
  open: false, draft: gradientDraftFromFormat({}), busy: false, error: null,
}
const stateAtom = atom<GradientPanel & {
  readonly connection: RustWorkbookConnection | null
  readonly selection: SelectionAuthorityWitness | null
}>({ ...initial, connection: null, selection: null })

export const gradientFillPanelAtom = atom<GradientPanel>(get => {
  const panel = get(stateAtom)
  return panel.connection === get(rustWorkbookConnectionAtom) ? panel : initial
})
export const gradientFillPreviewAtom = atom(get =>
  gradientFromDraft(get(gradientFillPanelAtom).draft))

type Action = 'open' | 'close' | 'apply' |
  { type: 'mode'; value: GradientDraft['mode'] } |
  { type: 'angle' | GradientEdge | 'startColor' | 'endColor'; value: string }

/** Plugin-owned session; the only workbook mutation is the public native selection-format command. */
export const configureGradientFillAtom = atom(null, async (get, set, action: Action) => {
  const panel = get(gradientFillPanelAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (panel.busy) return false
  if (action === 'close') {
    set(stateAtom, { ...initial, connection, selection: null })
    return true
  }
  if (!connection || get(editingSessionAtom).source
    || get(selectionMutationFeedbackAtom).busy) return false
  if (action === 'open') {
    set(stateAtom, { ...initial, open: true, connection,
      selection: get(selectionAuthorityWitnessAtom),
      draft: gradientDraftFromFormat(get(activeCellFormatAtom)) })
    return true
  }
  if (!panel.open) return false
  const state = get(stateAtom)
  if (typeof action === 'object') {
    if (typeof action.value !== 'string' || action.value.length > 64) return false
    let draft = state.draft
    if (action.type === 'mode') {
      if (action.value !== 'linear-gradient' && action.value !== 'path-gradient') return false
      draft = { ...draft, mode: action.value }
    } else if (action.type === 'angle') draft = { ...draft, angle: gradientNumericInput(action.value) }
    else if (action.type === 'startColor' || action.type === 'endColor')
      draft = gradientColorInput(draft, action.type, action.value)
    else draft = { ...draft, rectangle: { ...draft.rectangle,
      [action.type]: gradientNumericInput(action.value, true) } }
    set(stateAtom, { ...state, draft, error: null })
    return true
  }
  if (state.selection !== get(selectionAuthorityWitnessAtom)) {
    set(stateAtom, { ...state, error: 'selection' }); return false
  }
  const fill = gradientFromDraft(state.draft)
  if (!fill) { set(stateAtom, { ...state, error: 'invalidGradient' }); return false }
  const pending = { ...state, busy: true, error: null }
  set(stateAtom, pending)
  const response = set(applySelectionFormatAtom, { type: 'cell-fill', value: fill,
    background: gradientColorAt(fill.stops, 0, state.draft.fallback) })
  await Promise.resolve()
  if (get(stateAtom) === pending) set(stateAtom, pending)
  const outcome = await response
  if (get(stateAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
  const completed = outcome === 'completed' || outcome === 'superseded'
  set(stateAtom, completed ? { ...initial, connection, selection: null } : { ...state, error: 'failed' })
  return completed
})
stateAtom.debugLabel = 'plugin.cellAppearance.gradientDraft'
gradientFillPanelAtom.debugLabel = 'plugin.cellAppearance.gradientPanel'
gradientFillPreviewAtom.debugLabel = 'plugin.cellAppearance.gradientPreview'
configureGradientFillAtom.debugLabel = 'plugin.cellAppearance.configureGradient'
