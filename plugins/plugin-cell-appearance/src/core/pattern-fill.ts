import { atom } from '@einfach/core'
import {
  activeCellFormatAtom, applySelectionFormatAtom, CELL_FILL_PATTERNS, editingSessionAtom,
  rustWorkbookConnectionAtom, selectionAuthorityWitnessAtom, selectionMutationFeedbackAtom,
  type RustWorkbookConnection, type SelectionAuthorityWitness, type SpreadsheetFillPattern,
} from '@einfach-excel/spreadsheet-ui-core'

interface PatternFillDraft {
  readonly open: boolean
  readonly pattern: SpreadsheetFillPattern
  readonly foreground: string
  readonly background: string
  readonly busy: boolean
  readonly error: 'invalid' | 'selection' | 'failed' | null
}
const initial: PatternFillDraft = {
  open: false, pattern: 'lightDown', foreground: '#000000', background: '#ffffff',
  busy: false, error: null,
}
const draftAtom = atom<PatternFillDraft & {
  readonly connection: RustWorkbookConnection | null
  readonly selection: SelectionAuthorityWitness | null
}>({ ...initial, connection: null, selection: null })

export const patternFillPanelAtom = atom<PatternFillDraft>(get => {
  const draft = get(draftAtom)
  return draft.connection === get(rustWorkbookConnectionAtom) ? draft : initial
})

type Action = 'open' | 'close' | 'apply' |
  { type: 'pattern'; value: SpreadsheetFillPattern } |
  { type: 'foreground' | 'background'; value: string }

/** Plugin-owned draft; Apply uses the existing native selection-format transaction. */
export const configurePatternFillAtom = atom(null, async (get, set, action: Action) => {
  const panel = get(patternFillPanelAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (panel.busy) return false
  if (action === 'close') {
    set(draftAtom, { ...initial, connection, selection: null })
    return true
  }
  if (!connection || get(editingSessionAtom).source || get(selectionMutationFeedbackAtom).busy)
    return false
  if (action === 'open') {
    const format = get(activeCellFormatAtom)
    const fill = format.fill
    set(draftAtom, { ...initial, open: true, connection,
      selection: get(selectionAuthorityWitnessAtom),
      pattern: fill?.kind === 'pattern' ? fill.pattern : initial.pattern,
      foreground: fill?.kind === 'pattern' ? fill.foreground : initial.foreground,
      background: format.bgColor && /^#[\da-f]{6}$/i.test(format.bgColor)
        ? format.bgColor.toLowerCase() : initial.background,
    })
    return true
  }
  if (!panel.open) return false
  const draft = get(draftAtom)
  if (typeof action === 'object') {
    if (action.type === 'pattern' && !CELL_FILL_PATTERNS.includes(action.value)) return false
    if (typeof action.value !== 'string' || action.value.length > 64) return false
    set(draftAtom, { ...draft, [action.type]: action.value, error: null })
    return true
  }
  if (draft.selection !== get(selectionAuthorityWitnessAtom)) {
    set(draftAtom, { ...draft, error: 'selection' })
    return false
  }
  if (![draft.foreground, draft.background].every(color => /^#[\da-f]{6}$/i.test(color))) {
    set(draftAtom, { ...draft, error: 'invalid' })
    return false
  }
  const pending = { ...draft, busy: true, error: null }
  set(draftAtom, pending)
  const response = set(applySelectionFormatAtom, { type: 'cell-fill',
    value: { kind: 'pattern', pattern: draft.pattern, foreground: draft.foreground.toLowerCase() },
    background: draft.background.toLowerCase(),
  })
  // Publish pending state across the async command's transaction boundary.
  await Promise.resolve()
  if (get(draftAtom) === pending) set(draftAtom, pending)
  const outcome = await response
  if (get(draftAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
  const completed = outcome === 'completed' || outcome === 'superseded'
  set(draftAtom, completed ? { ...initial, connection, selection: null } : { ...draft, error: 'failed' })
  return completed
})
draftAtom.debugLabel = 'plugin.cellAppearance.patternDraft'
patternFillPanelAtom.debugLabel = 'plugin.cellAppearance.patternPanel'
configurePatternFillAtom.debugLabel = 'plugin.cellAppearance.configurePattern'
