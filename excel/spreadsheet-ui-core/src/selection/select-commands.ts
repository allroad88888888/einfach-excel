import { atom } from '@einfach/core'
import { clampCellCoord, getSelectionAnchorCell, normalizeSelection } from './geometry'
import { getPrimaryRegion } from './selection-copy'
import {
  _multiSelectionAtom,
  captureSelectionWriteAuthority,
  commitMultiSelectionState,
  selectionWriteAuthorityIsCurrent,
} from './selection-authority'
import {
  snapshotSelectCellInput,
  snapshotSelectColumnsInput,
  snapshotSelectRowsInput,
} from './command-input-snapshot'
import { snapshotOptionalSheetId } from './selection-input-snapshot'
import { selectionAtom } from './selection-state-atoms'
import type { SelectCellInput, SelectColumnsInput, SelectRowsInput } from './types'

export const selectCellAtom = atom(
  (get) => get(selectionAtom),
  (get, set, input: SelectCellInput) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextInput = snapshotSelectCellInput(input)
    if (nextInput.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    const current = normalizeSelection(getPrimaryRegion(captured.multi), captured.bounds)
    const sheetId = nextInput.value.sheetId ?? current.sheetId
    const coord = clampCellCoord(nextInput.value.coord, captured.bounds)

    if (!nextInput.value.extend || sheetId !== current.sheetId) {
      commitMultiSelectionState(get, set, {
        regions: [{ kind: 'cell', sheetId, anchor: coord, focus: coord }],
        primaryIndex: 0,
      })
      return
    }

    commitMultiSelectionState(get, set, {
      regions: [
        normalizeSelection(
          {
            kind: 'range',
            sheetId,
            anchor: getSelectionAnchorCell(current, captured.bounds),
            focus: coord,
          },
          captured.bounds,
        ),
      ],
      primaryIndex: 0,
    })
  },
)
selectCellAtom.debugLabel = 'spreadsheet.selection.selectCell'

export const selectRowsAtom = atom(
  (get) => get(selectionAtom),
  (get, set, input: SelectRowsInput) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextInput = snapshotSelectRowsInput(input)
    if (nextInput.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    const current = getPrimaryRegion(captured.multi)
    const rowFocus = nextInput.value.rowFocus ?? nextInput.value.rowAnchor
    commitMultiSelectionState(get, set, {
      regions: [
        normalizeSelection(
          {
            kind: 'row',
            sheetId: nextInput.value.sheetId ?? current.sheetId,
            rowAnchor: nextInput.value.rowAnchor,
            rowFocus,
          },
          captured.bounds,
        ),
      ],
      primaryIndex: 0,
    })
  },
)
selectRowsAtom.debugLabel = 'spreadsheet.selection.selectRows'

export const selectColumnsAtom = atom(
  (get) => get(selectionAtom),
  (get, set, input: SelectColumnsInput) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextInput = snapshotSelectColumnsInput(input)
    if (nextInput.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    const current = getPrimaryRegion(captured.multi)
    const colFocus = nextInput.value.colFocus ?? nextInput.value.colAnchor
    commitMultiSelectionState(get, set, {
      regions: [
        normalizeSelection(
          {
            kind: 'column',
            sheetId: nextInput.value.sheetId ?? current.sheetId,
            colAnchor: nextInput.value.colAnchor,
            colFocus,
          },
          captured.bounds,
        ),
      ],
      primaryIndex: 0,
    })
  },
)
selectColumnsAtom.debugLabel = 'spreadsheet.selection.selectColumns'

export const selectAllAtom = atom(
  (get) => get(selectionAtom),
  (get, set, sheetId?: string) => {
    const captured = captureSelectionWriteAuthority(get)
    const nextSheetId = snapshotOptionalSheetId(sheetId)
    if (nextSheetId.kind === 'invalid' || !selectionWriteAuthorityIsCurrent(get, captured)) {
      return
    }
    const current = getPrimaryRegion(captured.multi)
    commitMultiSelectionState(get, set, {
      regions: [{ kind: 'all', sheetId: nextSheetId.value ?? current.sheetId }],
      primaryIndex: 0,
    })
  },
)
selectAllAtom.debugLabel = 'spreadsheet.selection.selectAll'
