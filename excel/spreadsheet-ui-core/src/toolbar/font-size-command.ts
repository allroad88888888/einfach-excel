import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { activeCellFormatAtom } from '../projection'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { selectionAuthorityWitnessAtom, type SelectionAuthorityWitness } from '../selection'
import { applySelectionFormatAtom } from './selection-format-command'

export const DEFAULT_FONT_SIZE = 12
export const FONT_SIZE_PRESETS = [
  1, 2, 4, 6, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72, 96, 128, 256, 512,
] as const

interface FontSizeState {
  readonly draft: string
  readonly witness: SelectionAuthorityWitness | null
  readonly busy: boolean
  readonly error: string | null
}
const CLOSED: FontSizeState = { draft: '', witness: null, busy: false, error: null }

/** 仅保存字号面板交互；格子字号与行高始终来自 Rust 投影。 */
export const fontSizePanelAtom = atom<FontSizeState>(CLOSED)
type FontSizeAction =
  | 'open' | 'close' | 'apply' | 'increase' | 'decrease'
  | { readonly type: 'draft'; readonly value: string }
  | { readonly type: 'set'; readonly value: number }

/** 增减按相邻档位统一设置选区；自定义值必须符合 Rust 的整数字号契约。 */
export const runFontSizeAtom = atom(null, async (get, set, action: FontSizeAction) => {
  const state = get(fontSizePanelAtom)
  if (state.busy) return false
  if (action === 'close') {
    set(fontSizePanelAtom, CLOSED)
    return true
  }
  if (typeof action === 'object' && action.type === 'draft') {
    if (!state.witness) return false
    set(fontSizePanelAtom, { ...state, draft: action.value, error: null })
    return true
  }
  const connection = get(rustWorkbookConnectionAtom)
  if (!connection || get(editingSessionAtom).source) return false
  const current = get(activeCellFormatAtom).fontSize ?? DEFAULT_FONT_SIZE
  const witness = get(selectionAuthorityWitnessAtom)
  if (action === 'open') {
    set(fontSizePanelAtom, { ...CLOSED, draft: String(current), witness })
    return true
  }
  const fail = (error: string) => {
    const currentState = get(fontSizePanelAtom)
    // 快捷按钮失败也在同一弹窗重试，避免错误被窄屏工具栏裁切。
    set(fontSizePanelAtom, {
      ...currentState, witness: currentState.witness ?? witness, busy: false, error,
    })
    return false
  }
  if (action === 'apply' && (!state.witness || state.witness !== witness))
    return fail('The selection changed. Close the dialog and select the target again.')
  const value = typeof action === 'object' ? action.value
    : action === 'increase' ? FONT_SIZE_PRESETS.find((size) => size > current)
      : action === 'decrease' ? [...FONT_SIZE_PRESETS].reverse().find((size) => size < current)
        : Number(state.draft.trim())
  // 已到最小/最大档位时无写入、无历史；不把边界伪装成失败。
  if (value === undefined) return false
  if (!Number.isInteger(value) || value < 1 || value > 512)
    return fail('Enter a whole-number font size from 1 to 512 pixels.')
  const pending = { ...state, draft: String(value), busy: true, error: null }
  set(fontSizePanelAtom, pending)
  const response = set(applySelectionFormatAtom, { type: 'font-size', value })
  await Promise.resolve()
  if (get(fontSizePanelAtom) === pending) set(fontSizePanelAtom, pending)
  const outcome = await response
  if (get(fontSizePanelAtom) !== pending) return false
  if (get(rustWorkbookConnectionAtom) !== connection) {
    set(fontSizePanelAtom, CLOSED)
    return false
  }
  if (outcome !== 'completed' && outcome !== 'superseded')
    return fail(outcome === 'blocked'
      ? 'Select an editable range and wait for the worksheet to finish loading.'
      : 'Could not confirm the font size. Check the cell before retrying.')
  set(fontSizePanelAtom, CLOSED)
  return true
})
