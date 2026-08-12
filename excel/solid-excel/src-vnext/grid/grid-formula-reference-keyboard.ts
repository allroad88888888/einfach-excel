import type { Store } from '@einfach/core'
import {
  formulaReferenceSessionAtom,
  pickFormulaReferenceAtom,
  type FormulaReferenceArrowPickIntent,
} from '@einfach/spreadsheet-ui-core'

/** Applies one already-resolved formula-reference arrow intent through the shared Atom session. */
export function applyFormulaReferenceArrowPick(
  store: Store,
  intent: FormulaReferenceArrowPickIntent,
): void {
  const session = store.getter(formulaReferenceSessionAtom)
  if (!session) return
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
