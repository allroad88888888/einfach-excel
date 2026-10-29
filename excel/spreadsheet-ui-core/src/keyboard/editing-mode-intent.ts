import type { KeyboardCommandIntent, KeyboardInput } from './types'

export function getEditingModeIntent(input: KeyboardInput): KeyboardCommandIntent {
  if (input.key === 'Enter' && input.altKey) {
    return { type: 'none', reason: 'editing-text-navigation' }
  }
  if (input.key === 'Escape') {
    return {
      type: 'editing.cancel',
    }
  }

  if (input.key === 'Enter') {
    return {
      type: 'editing.commit',
      move: input.shiftKey ? 'up' : 'down',
    }
  }

  if (input.key === 'Tab') {
    return {
      type: 'editing.commit',
      move: input.shiftKey ? 'left' : 'right',
    }
  }

  return {
    type: 'none',
    reason: 'editing-text-navigation',
  }
}
