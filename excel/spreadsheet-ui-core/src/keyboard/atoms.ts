import { atom } from '@einfach/core'
import { projectionSnapshotBackingAtom } from '../projection/state'
import { mergeRangeAt } from '../shared/merge'
import {
  clearNonPrimaryRegionsAtom,
  selectionAtom,
  selectionBoundsAtom,
  selectionRegionsAtom,
} from '../selection'
import { applyKeyboardMove } from './apply-keyboard-move'
import { cancelPointerAtom } from '../pointer'
import { resetAppendPointerAtom } from '../selection/multi-range/pointer-append'
import { getKeyboardCommandIntent } from './command-intent'
import { sheetHiddenRowsBackingAtom, viewportHiddenColsBackingAtom, viewportFilterHiddenBackingAtom } from '../viewport/hidden-state'
import type { KeyboardCommandIntent, KeyboardInput, KeyboardMode } from './types'

export const keyboardModeAtom = atom<KeyboardMode>('navigation')
keyboardModeAtom.debugLabel = 'spreadsheet.keyboard.mode'

export const lastKeyboardIntentAtom = atom<KeyboardCommandIntent>({
  type: 'none',
  reason: 'unhandled',
})
lastKeyboardIntentAtom.debugLabel = 'spreadsheet.keyboard.lastIntent'

export const clearKeyboardIntentAtom = atom(
  (get) => get(lastKeyboardIntentAtom),
  (_get, set) => {
    set(lastKeyboardIntentAtom, {
      type: 'none',
      reason: 'unhandled',
    })
  },
)
clearKeyboardIntentAtom.debugLabel = 'spreadsheet.keyboard.clearIntent'

export const dispatchKeyboardInputAtom = atom(
  (get) => get(lastKeyboardIntentAtom),
  (get, set, input: KeyboardInput): KeyboardCommandIntent => {
    if (get(keyboardModeAtom) === 'navigation' && !input.isComposing && input.key === 'Escape') {
      set(cancelPointerAtom)
      set(resetAppendPointerAtom)
    }
    const result = get(projectionSnapshotBackingAtom).result
    const mergedRanges =
      result?.kind === 'visible-window' && result.sheetId === get(selectionAtom).sheetId
        ? result.mergedRanges : undefined
    const intent = getKeyboardCommandIntent({
      ...input,
      resolveMergeRange: input.resolveMergeRange ??
        (mergedRanges ? (row, col) => mergeRangeAt(mergedRanges, { row, col }) ?? null : undefined),
    }, {
      mode: get(keyboardModeAtom),
      selection: get(selectionAtom),
      bounds: get(selectionBoundsAtom),
      selectionRegionCount: get(selectionRegionsAtom).length,
      hiddenRows: new Set([
        ...(get(sheetHiddenRowsBackingAtom)[get(selectionAtom).sheetId] ?? []),
        ...(get(viewportFilterHiddenBackingAtom).rowsBySheet[get(selectionAtom).sheetId] ?? []),
      ]),
      hiddenColumns: new Set(get(viewportHiddenColsBackingAtom)[get(selectionAtom).sheetId] ?? []),
    })

    if (intent.type !== 'formulaReference.arrowPick' && intent.type !== 'formulaReference.exit') {
      if (intent.type === 'selection.move') {
        applyKeyboardMove(get, set, intent)
      } else if (intent.type === 'selection.selectAll') {
        set(selectionAtom, intent.selection)
      } else if (intent.type === 'selection.clearNonPrimary') {
        set(clearNonPrimaryRegionsAtom, { keepPrimary: true })
      }
    }

    set(lastKeyboardIntentAtom, intent)
    return intent
  },
)
dispatchKeyboardInputAtom.debugLabel = 'spreadsheet.keyboard.dispatch'
