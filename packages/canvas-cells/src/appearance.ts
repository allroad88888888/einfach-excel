import type { Store } from '@einfach/core'
import {
  selectionRangesAtom, formulaReferenceSessionAtom, showFormulasAtom,
  nativeFilterRangeAtom, nativeFilterRulesAtom, nativeTableFiltersAtom,
  nativeFilterFeedbackAtom, editingSessionAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import type { CanvasCellsInput, CellAppearance, LayoutCell } from './types'

export const appearanceAtoms = [selectionRangesAtom, formulaReferenceSessionAtom, showFormulasAtom,
  nativeFilterRangeAtom, nativeFilterRulesAtom, nativeTableFiltersAtom, nativeFilterFeedbackAtom,
  editingSessionAtom] as const

/** Read region state once; cell atoms only receive changed visual results. */
export function appearanceReader(store: Store, input: CanvasCellsInput) {
  const reference = store.getter(formulaReferenceSessionAtom)
  const picked = reference?.pickAnchor && reference.pickFocus ? {
    rowStart: Math.min(reference.pickAnchor.row, reference.pickFocus.row),
    rowEnd: Math.max(reference.pickAnchor.row, reference.pickFocus.row),
    colStart: Math.min(reference.pickAnchor.col, reference.pickFocus.col),
    colEnd: Math.max(reference.pickAnchor.col, reference.pickFocus.col),
  } : undefined
  const ranges = picked ? [picked] : input.selected
    ? [input.selected] : store.getter(selectionRangesAtom)
  const showFormulas = store.getter(showFormulasAtom)
  const filterRange = store.getter(nativeFilterRangeAtom)
  const rules = store.getter(nativeFilterRulesAtom)
  const tables = store.getter(nativeTableFiltersAtom)
  const disabled = store.getter(nativeFilterFeedbackAtom).busy
    || store.getter(editingSessionAtom).source !== null
  return (item: LayoutCell, hovered: boolean): CellAppearance => {
    const r = item.range
    let selected = false, edges = 0
    for (const range of ranges) {
      if (r.rowStart > range.rowEnd || r.rowEnd < range.rowStart
        || r.colStart > range.colEnd || r.colEnd < range.colStart) continue
      selected = true
      if (range.rowStart === r.rowStart) edges |= 1
      if (range.colEnd === r.colEnd) edges |= 2
      if (range.rowEnd === r.rowEnd) edges |= 4
      if (range.colStart === r.colStart) edges |= 8
    }
    const table = tables.find(target => target.range.rowStart === r.rowStart
      && r.colStart >= target.range.colStart && r.colStart <= target.range.colEnd)
    const filter = !item.merged && (table || filterRange?.rowStart === r.rowStart
      && r.colStart >= filterRange.colStart && r.colStart <= filterRange.colEnd)
      ? { table: table?.table, disabled,
        active: (table?.rules ?? rules).some(rule => rule.colIndex === r.colStart) } : undefined
    return { hovered, selected, edges, reference: Boolean(picked), showFormulas, filter }
  }
}
export function sameAppearance(a: CellAppearance, b: CellAppearance) {
  return a.hovered === b.hovered && a.selected === b.selected && a.edges === b.edges
    && a.reference === b.reference && a.showFormulas === b.showFormulas
    && Boolean(a.filter) === Boolean(b.filter) && a.filter?.table === b.filter?.table
    && a.filter?.disabled === b.filter?.disabled && a.filter?.active === b.filter?.active
}
