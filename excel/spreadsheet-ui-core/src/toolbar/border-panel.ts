import { atom } from '@einfach/core'
import type { RangeBorderPatch } from '../backend/format-contracts'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeCellFormatAtom } from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook'
import { selectionAuthorityWitnessAtom, type SelectionAuthorityWitness } from '../selection'
import { runSelectionMutationAtom } from './selection-mutation-command'

export const BORDER_PRESETS = [
  'outside', 'inside', 'all', 'horizontal', 'vertical', 'top', 'right', 'bottom', 'left', 'none',
] as const
export const BORDER_STYLES = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'] as const
interface BorderPanel {
  draft: RangeBorderPatch
  target: { witness: SelectionAuthorityWitness; connection: RustWorkbookConnection } | null
  busy: boolean
  error: string | null
}
const CLOSED: BorderPanel = {
  draft: { preset: 'outside', style: 'thin', color: '#000000' },
  target: null, busy: false, error: null,
}

/** 仅保存尚未提交的设置；真实边框始终从 Rust 投影读取。 */
export const borderPanelAtom = atom<BorderPanel>(CLOSED)
type Action = 'open' | 'close' | 'apply' | { type: 'draft'; patch: Partial<RangeBorderPatch> }

export const runBorderPanelAtom = atom(null, async (get, set, action: Action) => {
  const state = get(borderPanelAtom)
  if (state.busy) return false
  if (action === 'close') {
    set(borderPanelAtom, CLOSED)
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  if (action === 'open') {
    if (!connection || get(editingSessionAtom).source) return false
    const borders = get(activeCellFormatAtom).borders
    const current = borders && Object.values(borders).find((border) => border?.style !== 'none')
    set(borderPanelAtom, {
      ...CLOSED,
      draft: { ...CLOSED.draft,
        style: current && current.style !== 'none' ? current.style : 'thin',
        color: /^#[\da-f]{6}$/i.test(current?.color ?? '') ? current!.color! : '#000000',
      },
      target: { connection, witness: get(selectionAuthorityWitnessAtom) },
    })
    return true
  }
  if (!state.target) return false
  if (typeof action === 'object') {
    set(borderPanelAtom, { ...state, draft: { ...state.draft, ...action.patch }, error: null })
    return true
  }
  const fail = (error: string) => {
    set(borderPanelAtom, { ...state, busy: false, error })
    return false
  }
  if (connection !== state.target.connection ||
    get(selectionAuthorityWitnessAtom) !== state.target.witness)
    return fail('The selection or workbook changed. Close this dialog and select the target again.')
  if (get(editingSessionAtom).source) return fail('Finish editing the cell before applying borders.')
  const { preset, style, color } = state.draft
  if (!BORDER_PRESETS.includes(preset) || !BORDER_STYLES.includes(style))
    return fail('Choose a supported border position and line style.')
  const validColor = /^#[\da-f]{6}$/i.test(color)
  if (preset !== 'none' && !validColor) return fail('Enter a color as #RRGGBB, for example #c00000.')
  const pending = { ...state, busy: true, error: null }
  set(borderPanelAtom, pending)
  const response = set(runSelectionMutationAtom, {
    kind: 'format', format: {}, borderPatch: { preset, style, color: validColor ? color.toLowerCase() : '#000000' },
  })
  await Promise.resolve()
  if (get(borderPanelAtom) === pending) set(borderPanelAtom, pending)
  const outcome = await response
  if (get(borderPanelAtom) !== pending) return false
  if (get(rustWorkbookConnectionAtom) !== connection) {
    set(borderPanelAtom, CLOSED)
    return false
  }
  if (outcome !== 'completed' && outcome !== 'superseded')
    return fail(outcome === 'blocked'
      ? 'Select an editable range and wait for the worksheet to finish loading.'
      : 'Could not confirm the borders. Check the cells before retrying.')
  set(borderPanelAtom, CLOSED)
  return true
})
