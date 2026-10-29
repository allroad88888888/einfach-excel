import { getKeyboardMovementIntent } from './keyboard-movement'
import { getCommandShortcutIntent } from './command-shortcut-intent'
import { getEditingModeIntent } from './editing-mode-intent'
import { getFormulaReferenceModeIntent } from './formula-reference-intent'
import type { KeyboardCommandIntent, KeyboardCommandState, KeyboardInput } from './types'

export function getKeyboardCommandIntent(
  input: KeyboardInput,
  state: KeyboardCommandState,
): KeyboardCommandIntent {
  if (input.isComposing) {
    return {
      type: 'none',
      reason: 'composing',
    }
  }

  if (state.mode === 'editing') {
    return getEditingModeIntent(input)
  }

  if (state.mode === 'formula-reference') {
    return getFormulaReferenceModeIntent(input)
  }

  if (
    !input.ctrlKey &&
    !input.metaKey &&
    !input.altKey &&
    (input.key === 'ContextMenu' || (input.key === 'F10' && input.shiftKey))
  ) {
    return {
      type: 'context-menu.open',
      source: 'keyboard',
    }
  }

  const commandIntent = getCommandShortcutIntent(input, state)
  if (commandIntent.type !== 'none') {
    return commandIntent
  }

  if (input.key === 'Escape' && (state.selectionRegionCount ?? 1) > 1) {
    return {
      type: 'selection.clearNonPrimary',
      keepPrimary: true,
    }
  }

  if (input.altKey && !isHorizontalPageInput(input)) {
    return {
      type: 'none',
      reason: 'unhandled',
    }
  }

  const movementIntent = getKeyboardMovementIntent(input, state)
  if (movementIntent.type !== 'none') {
    return movementIntent
  }

  if (input.key === 'F2') {
    return {
      type: 'editing.start',
      source: 'keyboard',
    }
  }

  if (input.key === 'Backspace') {
    return {
      type: 'editing.start',
      source: 'keyboard',
      initialDraft: '',
      clearOnStart: true,
    }
  }

  if (input.key === 'Delete') {
    return {
      type: 'cell.clear',
      target: input.ctrlKey || input.metaKey ? 'all' : 'values',
    }
  }

  if (input.key.length === 1 && !input.ctrlKey && !input.metaKey && !input.altKey) {
    return {
      type: 'editing.start',
      source: 'keyboard',
      initialDraft: input.key,
      clearOnStart: true,
    }
  }

  return {
    type: 'none',
    reason: 'unhandled',
  }
}

function isHorizontalPageInput(input: KeyboardInput): boolean {
  return input.key === 'PageUp' || input.key === 'PageDown'
}
