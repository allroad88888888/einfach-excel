import { atom } from '@einfach/core'
import { pointerSessionAtom, startPointerAtom, updatePointerAtom, commitPointerAtom, cancelPointerAtom } from '../pointer'
import type { CellCoord } from '../shared'
import { selectionSnapshotAtom, setSelectionWithAuthorityReceiptAtom } from './index'
import { formulaReferenceSessionAtom, pickFormulaReferenceAtom } from '../formula-reference'
import { formatPainterAtom } from '../format-painter/state'
import { appendPointerRegionAtom, finishAppendPointerAtom, resetAppendPointerAtom } from './multi-range/pointer-append'

export interface StartPointerSelectionInput {
  readonly sheetId: string
  readonly coord: CellCoord
  readonly extend?: boolean
  /** Ctrl/Command appends a local rectangle; Shift and formula picks take priority. */
  readonly append?: boolean
}

export interface UpdatePointerSelectionInput {
  readonly sheetId: string
  readonly coord: CellCoord
}

export type PointerSelectionCommandOutcome =
  | { readonly status: 'applied'; readonly coord: Readonly<CellCoord> }
  | {
      readonly status: 'ignored'
      readonly reason: 'invalid' | 'inactive' | 'interaction-mismatch' | 'sheet-mismatch' |
        'area-limit' | 'selection-changed'
    }

function sameCoord(left: CellCoord, right: CellCoord): boolean {
  return left.row === right.row && left.col === right.col
}

/** Starts one drag-selection intent as one atomic selection transition. */
export const startPointerSelectionAtom = atom(
  null,
  (get, set, input: StartPointerSelectionInput): PointerSelectionCommandOutcome => {
    set(resetAppendPointerAtom)
    const reference = get(formulaReferenceSessionAtom)
    if (reference?.sheetId === input.sheetId) {
      set(startPointerAtom, { kind: 'drag-selection', sheetId: input.sheetId,
        anchor: input.coord, focus: input.coord, source: 'pointer' })
      set(pickFormulaReferenceAtom, { sheetId: input.sheetId,
        pickAnchor: input.coord, pickFocus: input.coord, dragging: true })
      return { status: 'applied', coord: input.coord }
    }
    const current = get(selectionSnapshotAtom).selection
    // Shift 沿用原起点；焦点和拖拽终点仍由本次指针位置决定，不能把上一次终点当起点。
    const anchor = !input.extend || current.sheetId !== input.sheetId ? input.coord
      : current.kind === 'cell' || current.kind === 'range' ? current.anchor
      : current.kind === 'row' ? { row: current.rowAnchor, col: 0 }
      : current.kind === 'column' ? { row: 0, col: current.colAnchor } : { row: 0, col: 0 }
    const selection = {
      kind: input.extend ? 'range' : 'cell',
      sheetId: input.sheetId,
      anchor,
      focus: input.coord,
    } as const
    const append = Boolean(input.append && !input.extend && current.sheetId === input.sheetId &&
      get(formatPainterAtom).mode === 'idle')
    const outcome = append ? set(appendPointerRegionAtom, { phase: 'start', region: selection }) : null
    if (outcome?.status === 'ignored') {
      set(cancelPointerAtom)
      return outcome
    }
    const receipt = outcome?.status === 'applied' ? outcome.receipt
      : set(setSelectionWithAuthorityReceiptAtom, selection)
    if (receipt === null || (receipt.selection.kind !== 'cell' && receipt.selection.kind !== 'range')) {
      return Object.freeze({ status: 'ignored', reason: 'invalid' })
    }
    const coord = Object.freeze({ ...receipt.selection.focus })
    set(startPointerAtom, {
      kind: 'drag-selection',
      sheetId: receipt.selection.sheetId,
      anchor: Object.freeze({ ...receipt.selection.anchor }),
      focus: coord,
      source: 'pointer',
      append,
    })
    return Object.freeze({ status: 'applied', coord })
  },
)

startPointerSelectionAtom.debugLabel = 'spreadsheet.selection.startPointer'

/** Extends one drag-selection intent as one atomic selection transition. */
export const updatePointerSelectionAtom = atom(
  null,
  (get, set, input: UpdatePointerSelectionInput): PointerSelectionCommandOutcome => {
    const pointer = get(pointerSessionAtom)
    if (pointer.status !== 'active' || pointer.interaction === null) {
      return Object.freeze({ status: 'ignored', reason: 'inactive' })
    }
    if (pointer.interaction.kind !== 'drag-selection') {
      return Object.freeze({ status: 'ignored', reason: 'interaction-mismatch' })
    }
    if (input.sheetId !== pointer.interaction.sheetId) {
      return Object.freeze({ status: 'ignored', reason: 'sheet-mismatch' })
    }
    if (get(formulaReferenceSessionAtom)?.sheetId === input.sheetId) {
      set(pickFormulaReferenceAtom, { sheetId: input.sheetId,
        pickAnchor: pointer.interaction.anchor, pickFocus: input.coord, dragging: true })
      set(updatePointerAtom, { kind: 'drag-selection', focus: input.coord, source: 'pointer' })
      return { status: 'applied', coord: input.coord }
    }
    const selection = {
      kind: 'range',
      sheetId: pointer.interaction.sheetId,
      anchor: pointer.interaction.anchor,
      focus: input.coord,
    } as const
    const outcome = pointer.interaction.append
      ? set(appendPointerRegionAtom, { phase: 'update', region: selection }) : null
    if (outcome?.status === 'ignored') {
      set(cancelPointerAtom)
      return outcome
    }
    const receipt = outcome?.status === 'applied' ? outcome.receipt
      : set(setSelectionWithAuthorityReceiptAtom, selection)
    if (receipt === null || (receipt.selection.kind !== 'cell' && receipt.selection.kind !== 'range')) {
      return Object.freeze({ status: 'ignored', reason: 'invalid' })
    }
    const anchor = Object.freeze({ ...receipt.selection.anchor })
    const coord = Object.freeze({ ...receipt.selection.focus })
    if (sameCoord(anchor, pointer.interaction.anchor)) {
      set(updatePointerAtom, {
        kind: 'drag-selection',
        focus: coord,
        source: 'pointer',
      })
    } else {
      set(startPointerAtom, {
        kind: 'drag-selection',
        sheetId: receipt.selection.sheetId,
        anchor,
        focus: coord,
        append: pointer.interaction.append,
        source: pointer.source ?? 'pointer',
      })
    }
    return Object.freeze({ status: 'applied', coord })
  },
)

updatePointerSelectionAtom.debugLabel = 'spreadsheet.selection.updatePointer'

/** 松手只结束拖动，保留公式输入与其源单元格；Escape 由编辑命令取消草稿。 */
export const endPointerSelectionAtom = atom(null, (get, set, cancel = false) => {
  const reference = get(formulaReferenceSessionAtom)
  if (reference?.dragging && reference.pickAnchor && reference.pickFocus)
    set(pickFormulaReferenceAtom, { sheetId: reference.sheetId,
      pickAnchor: reference.pickAnchor, pickFocus: reference.pickFocus, dragging: false })
  set(finishAppendPointerAtom)
  if (cancel) set(cancelPointerAtom)
  else set(commitPointerAtom)
})
