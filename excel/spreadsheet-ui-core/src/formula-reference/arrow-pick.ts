import type { Store } from '@einfach/core'
import type { FormulaReferenceArrowPickIntent } from '../keyboard'
import { formulaReferenceSessionAtom, pickFormulaReferenceAtom } from './index'

/** Applies a keyboard arrow intent to the active formula-reference pick. */
export function applyFormulaReferenceArrowPick(
  store: Store,
  intent: FormulaReferenceArrowPickIntent,
): void {
  const session = store.getter(formulaReferenceSessionAtom)
  if (session === null) return

  const currentFocus = session.pickFocus ?? session.anchorCell
  const next = {
    row: Math.max(0, currentFocus.row + intent.rowDelta),
    col: Math.max(0, currentFocus.col + intent.colDelta),
  }
  store.setter(pickFormulaReferenceAtom, {
    pickAnchor: intent.extend ? (session.pickAnchor ?? currentFocus) : next,
    pickFocus: next,
    sheetId: session.sheetId,
    dragging: false,
  })
}
