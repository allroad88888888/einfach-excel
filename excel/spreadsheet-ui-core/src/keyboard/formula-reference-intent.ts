import type { KeyboardCommandIntent, KeyboardInput } from './types'

const FORMULA_REF_OPERATORS = new Set(['+', '-', '*', '/', '^', '&', '%', '<', '>', '='])

export function getFormulaReferenceModeIntent(input: KeyboardInput): KeyboardCommandIntent {
  if (input.key === 'Escape') {
    return { type: 'formulaReference.exit', reason: 'cancel' }
  }

  if (input.key === 'Enter' || input.key === 'Tab') {
    return { type: 'formulaReference.exit', reason: 'commit' }
  }

  switch (input.key) {
    case 'ArrowUp':
      return {
        type: 'formulaReference.arrowPick',
        rowDelta: -1,
        colDelta: 0,
        extend: Boolean(input.shiftKey),
      }
    case 'ArrowDown':
      return {
        type: 'formulaReference.arrowPick',
        rowDelta: 1,
        colDelta: 0,
        extend: Boolean(input.shiftKey),
      }
    case 'ArrowLeft':
      return {
        type: 'formulaReference.arrowPick',
        rowDelta: 0,
        colDelta: -1,
        extend: Boolean(input.shiftKey),
      }
    case 'ArrowRight':
      return {
        type: 'formulaReference.arrowPick',
        rowDelta: 0,
        colDelta: 1,
        extend: Boolean(input.shiftKey),
      }
  }

  if (input.key.length === 1) {
    if (input.key === ')') {
      return { type: 'formulaReference.exit', reason: 'close-paren-typed' }
    }
    if (input.key === ',') {
      return { type: 'formulaReference.exit', reason: 'separator-typed' }
    }
    if (FORMULA_REF_OPERATORS.has(input.key)) {
      return { type: 'formulaReference.exit', reason: 'operator-typed' }
    }
  }

  return { type: 'none', reason: 'editing-text-navigation' }
}
