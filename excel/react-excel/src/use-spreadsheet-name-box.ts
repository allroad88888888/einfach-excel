import type { Store } from '@einfach/core'
import {
  blurNameBoxAtom,
  commitNameBoxAtom,
  focusNameBoxAtom,
  nameBoxStateAtom,
  revertNameBoxAtom,
  scrollToCellAtom,
  setWorkspaceActiveSheetAtom,
  updateNameBoxInputAtom,
  workspaceSessionAtom,
  type CellCoord,
  type NameBoxCommitInput,
  type NameBoxCommitTarget,
  type NameBoxMode,
  type NameBoxSessionInput,
  type SelectionState,
  type UpdateNameBoxInput,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useMemo } from 'react'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

/** The UI-core-owned snapshot rendered by a name-box surface. */
export interface SpreadsheetNameBoxState {
  readonly display: string
  readonly error: boolean
  readonly focused: boolean
  readonly input: string
  readonly lastCommitted: string
  readonly mode: NameBoxMode
  readonly primaryRegion: SelectionState
  readonly sessionId: number
}

/** Commands and state for the name box in the nearest SpreadsheetUiProvider. */
export interface SpreadsheetNameBox {
  readonly state: SpreadsheetNameBoxState
  blur(input?: NameBoxSessionInput): boolean
  commit(input: NameBoxCommitInput): NameBoxCommitTarget
  focus(): number
  revert(input?: NameBoxSessionInput): boolean
  updateInput(input: UpdateNameBoxInput): boolean
}

/** The core target a host can use to move its rendered viewport. */
export interface NameBoxScrollTarget {
  readonly coord: CellCoord
  readonly sheetId: string
}

export interface UseSpreadsheetNameBoxOptions {
  /** Receives the cell that should become visible after a successful jump. */
  readonly onScrollToCell?: (target: NameBoxScrollTarget) => void
}

function createNameBoxStateSource(store: Store): SpreadsheetValueSource<SpreadsheetNameBoxState> {
  return {
    getSnapshot: () => store.getter(nameBoxStateAtom),
    subscribe: (onStoreChange) => store.sub(nameBoxStateAtom, onStoreChange),
  }
}

function getScrollTarget(target: NameBoxCommitTarget): NameBoxScrollTarget | null {
  switch (target.kind) {
    case 'cell':
      return { sheetId: target.sheetId, coord: target.coord }
    case 'range':
      return {
        sheetId: target.sheetId,
        coord: { row: target.range.rowStart, col: target.range.colStart },
      }
    case 'named-range':
      if (target.range) {
        return {
          sheetId: target.sheetId,
          coord: { row: target.range.rowStart, col: target.range.colStart },
        }
      }
      return target.coord ? { sheetId: target.sheetId, coord: target.coord } : null
    default:
      return null
  }
}

/** Reads and dispatches the name box owned by the nearest SpreadsheetUiProvider. */
export function useSpreadsheetNameBox(
  options: UseSpreadsheetNameBoxOptions = {},
): SpreadsheetNameBox {
  const { store } = useSpreadsheetUiCore()
  const { onScrollToCell } = options
  const source = useMemo(() => createNameBoxStateSource(store), [store])
  const state = useSpreadsheetValue(source)
  const focus = useCallback(() => store.setter(focusNameBoxAtom), [store])
  const updateInput = useCallback(
    (input: UpdateNameBoxInput) => store.setter(updateNameBoxInputAtom, input),
    [store],
  )
  const commit = useCallback(
    (input: NameBoxCommitInput) => {
      const activeSheetId = store.getter(workspaceSessionAtom).activeSheetId
      const target = store.setter(commitNameBoxAtom, input)
      if (target.kind === 'named-range' && target.sheetId !== activeSheetId) {
        store.setter(setWorkspaceActiveSheetAtom, { sheetId: target.sheetId })
      }
      const scrollTarget = getScrollTarget(target)
      if (scrollTarget) {
        store.setter(scrollToCellAtom, { coord: scrollTarget.coord })
        onScrollToCell?.(scrollTarget)
      }
      return target
    },
    [onScrollToCell, store],
  )
  const blur = useCallback(
    (input?: NameBoxSessionInput) => store.setter(blurNameBoxAtom, input),
    [store],
  )
  const revert = useCallback(
    (input?: NameBoxSessionInput) => store.setter(revertNameBoxAtom, input),
    [store],
  )

  return useMemo(
    () => ({ state, focus, updateInput, commit, blur, revert }),
    [blur, commit, focus, revert, state, updateInput],
  )
}
