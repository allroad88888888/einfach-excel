import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeCellFormatAtom } from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionAuthorityWitnessAtom, type SelectionAuthorityWitness } from '../selection'
import { closeToolbarSurfaceAtom, openToolbarPaletteAtom, toolbarActiveSurfaceAtom } from './surface-state'
import { applySelectionFormatAtom, SELECTION_FILL_COLOR, SELECTION_TEXT_COLOR } from './selection-format-command'
import type { ToolbarPaletteKind } from './types'

interface ColorPaletteState {
  readonly draft: string
  readonly busy: boolean
  readonly error: string | null
  readonly witness: SelectionAuthorityWitness | null
  readonly last: Readonly<Record<ToolbarPaletteKind, string>>
}

/** 仅保存色板交互草稿/上次颜色，格子最终颜色仍读取 Rust 投影。 */
export const colorPaletteAtom = atom<ColorPaletteState>({
  draft: '', busy: false, error: null, witness: null,
  last: { 'fill-color': SELECTION_FILL_COLOR, 'text-color': SELECTION_TEXT_COLOR },
})

type ColorAction =
  | { readonly type: 'open' | 'quick'; readonly kind: ToolbarPaletteKind }
  | { readonly type: 'draft'; readonly value: string }
  | { readonly type: 'choose'; readonly value: string | null }
  | 'apply' | 'close'

/** 一次色板操作一个 command；真正写入复用原有格式命令与原生行/列/cell 规则。 */
export const runColorPaletteAtom = atom(null, async (get, set, action: ColorAction) => {
  const state = get(colorPaletteAtom)
  if (state.busy) return false
  if (action === 'close') {
    set(closeToolbarSurfaceAtom)
    set(colorPaletteAtom, { ...state, error: null, witness: null })
    return true
  }
  const surface = get(toolbarActiveSurfaceAtom)
  const kind = typeof action === 'object' && 'kind' in action ? action.kind
    : surface?.kind === 'palette' ? surface.id : null
  if (kind !== 'fill-color' && kind !== 'text-color') return false
  if (typeof action === 'object' && action.type === 'draft') {
    set(colorPaletteAtom, { ...state, draft: action.value, error: null })
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection || get(editingSessionAtom).source) return false
  const witness = get(selectionAuthorityWitnessAtom)
  if (typeof action === 'object' && action.type === 'open') {
    const format = get(activeCellFormatAtom)
    const current = kind === 'fill-color' ? format.bgColor : format.fgColor
    set(colorPaletteAtom, { ...state, draft: current ?? state.last[kind], witness, error: null })
    set(openToolbarPaletteAtom, { palette: kind })
    return true
  }
  const quick = typeof action === 'object' && action.type === 'quick'
  const fail = (error: string) => {
    set(colorPaletteAtom, { ...state, busy: false, error })
    set(openToolbarPaletteAtom, { palette: kind })
    return false
  }
  if (!quick && state.witness !== witness)
    return fail('The selection changed. Close the palette and select the target again.')
  const value = quick ? state.last[kind]
    : typeof action === 'object' && action.type === 'choose' ? action.value : state.draft
  if (value !== null && !/^#[\da-f]{6}$/i.test(value.trim()))
    return fail('Enter a six-digit color such as #1a73e8.')
  const color = value === null ? null : value.trim().toLowerCase()
  const pending = { ...state, busy: true, error: null, witness,
    draft: color ?? state.draft }
  set(colorPaletteAtom, pending)
  const outcome = await set(applySelectionFormatAtom, { type: kind, value: color })
  if (get(rustWorkbookConnectionAtom) !== connection || get(colorPaletteAtom) !== pending)
    return false
  if (outcome !== 'completed' && outcome !== 'superseded')
    return fail(outcome === 'blocked'
      ? 'Select an editable range and wait for the worksheet to finish loading.'
      : 'Could not confirm the color change. Check the cell before retrying.')
  set(colorPaletteAtom, {
    ...pending, busy: false, witness: null,
    last: color === null ? state.last : { ...state.last, [kind]: color },
  })
  set(closeToolbarSurfaceAtom)
  return true
})
