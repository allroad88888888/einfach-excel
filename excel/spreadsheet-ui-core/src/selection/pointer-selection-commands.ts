import { atom } from '@einfach/core'
import { pointerSessionAtom, startPointerAtom, updatePointerAtom } from '../pointer'
import type { CellCoord } from '../shared'
import { setSelectionWithAuthorityReceiptAtom } from './index'

export interface StartPointerSelectionInput {
  readonly sheetId: string
  readonly coord: CellCoord
}

export interface UpdatePointerSelectionInput {
  readonly sheetId: string
  readonly coord: CellCoord
}

export type PointerSelectionCommandOutcome =
  | { readonly status: 'applied'; readonly coord: Readonly<CellCoord> }
  | {
      readonly status: 'ignored'
      readonly reason: 'invalid' | 'inactive' | 'interaction-mismatch' | 'sheet-mismatch'
    }

function sameCoord(left: CellCoord, right: CellCoord): boolean {
  return left.row === right.row && left.col === right.col
}

/** Starts one drag-selection intent as one atomic selection transition. */
export const startPointerSelectionAtom = atom(
  null,
  (_get, set, input: StartPointerSelectionInput): PointerSelectionCommandOutcome => {
    const receipt = set(setSelectionWithAuthorityReceiptAtom, {
      kind: 'cell',
      sheetId: input.sheetId,
      anchor: input.coord,
      focus: input.coord,
    })
    if (receipt === null || (receipt.selection.kind !== 'cell' && receipt.selection.kind !== 'range')) {
      return Object.freeze({ status: 'ignored', reason: 'invalid' })
    }
    const coord = Object.freeze({ ...receipt.selection.focus })
    set(startPointerAtom, {
      kind: 'drag-selection',
      sheetId: receipt.selection.sheetId,
      anchor: coord,
      focus: coord,
      source: 'pointer',
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
    const receipt = set(setSelectionWithAuthorityReceiptAtom, {
      kind: 'range',
      sheetId: pointer.interaction.sheetId,
      anchor: pointer.interaction.anchor,
      focus: input.coord,
    })
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
