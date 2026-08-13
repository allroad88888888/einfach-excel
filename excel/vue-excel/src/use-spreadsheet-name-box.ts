import type { Atom, Store } from '@einfach/core'
import {
  blurNameBoxAtom,
  commitNameBoxAtom,
  focusNameBoxAtom,
  nameBoxStateAtom,
  revertNameBoxAtom,
  scrollToCellAtom,
  selectionSnapshotAtom,
  setWorkspaceActiveSheetAtom,
  updateNameBoxInputAtom,
  workspaceSessionAtom,
  type CellCoord,
  type NameBoxCommitInput,
  type NameBoxCommitTarget,
  type NameBoxMode,
  type NameBoxSessionInput,
  type SelectionState,
  type SpreadsheetUiCore,
  type UpdateNameBoxInput,
} from '@einfach/spreadsheet-ui-core'
import { watch, type ComputedRef, type ShallowRef } from 'vue'
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

/** The coordinate a name-box navigation asks a host viewport to reveal. */
export interface SpreadsheetNameBoxScrollTarget {
  readonly coord: CellCoord
  readonly sheetId: string
}

/** Host callback for a name-box navigation that changes the visible viewport. */
export interface UseSpreadsheetNameBoxOptions {
  readonly onScrollToCell?: (target: SpreadsheetNameBoxScrollTarget) => void
}

/** Commands and state for the name box in the nearest SpreadsheetUiProvider. */
export interface SpreadsheetNameBox {
  readonly state: Readonly<ShallowRef<SpreadsheetNameBoxState>>
  blur: (input?: NameBoxSessionInput) => boolean
  commit: (input: NameBoxCommitInput) => NameBoxCommitTarget
  focus: () => number
  revert: (input?: NameBoxSessionInput) => boolean
  updateInput: (input: UpdateNameBoxInput) => boolean
}

function createNameBoxValueSource<T>(
  core: ComputedRef<SpreadsheetUiCore>,
  atom: Atom<T>,
): SpreadsheetValueSource<T> {
  return {
    getSnapshot: () => core.value.store.getter(atom) as T,
    subscribe: (onStoreChange) => {
      let activeStore: Store | undefined
      let unsubscribe: () => void = () => undefined
      const stop = watch(
        core,
        (nextCore) => {
          if (nextCore.store === activeStore) return
          unsubscribe()
          activeStore = nextCore.store
          unsubscribe = nextCore.store.sub(atom, onStoreChange)
          onStoreChange()
        },
        { immediate: true },
      )

      return () => {
        stop()
        unsubscribe()
      }
    },
  }
}

function getScrollTarget(target: NameBoxCommitTarget): SpreadsheetNameBoxScrollTarget | null {
  if (target.kind === 'cell') return { sheetId: target.sheetId, coord: target.coord }
  if (target.kind === 'range') {
    return {
      sheetId: target.sheetId,
      coord: { row: target.range.rowStart, col: target.range.colStart },
    }
  }
  if (target.kind === 'named-range') {
    const coord =
      target.coord ??
      (target.range === undefined
        ? undefined
        : { row: target.range.rowStart, col: target.range.colStart })
    return coord === undefined ? null : { sheetId: target.sheetId, coord }
  }
  return null
}

/** Binds a Vue name box to the nearest UI-core name-box atoms. */
export function useSpreadsheetNameBox(
  options: UseSpreadsheetNameBoxOptions = {},
): SpreadsheetNameBox {
  const core = useSpreadsheetUiCore()
  const state = useSpreadsheetValue(createNameBoxValueSource(core, nameBoxStateAtom)).value

  return {
    state,
    focus: () => core.value.store.setter(focusNameBoxAtom),
    updateInput: (input) => core.value.store.setter(updateNameBoxInputAtom, input),
    commit: (input) => {
      const store = core.value.store
      const selection = store.getter(selectionSnapshotAtom)
      const workspace = store.getter(workspaceSessionAtom)
      const sheetId =
        input.sheetId ??
        (selection.selection.sheetId.length > 0
          ? selection.selection.sheetId
          : (workspace.activeSheetId ?? ''))
      const target = store.setter(commitNameBoxAtom, { ...input, sheetId })
      const scrollTarget = getScrollTarget(target)

      if (target.kind === 'named-range' && target.sheetId !== workspace.activeSheetId) {
        store.setter(setWorkspaceActiveSheetAtom, { sheetId: target.sheetId })
      }
      if (scrollTarget !== null) {
        store.setter(scrollToCellAtom, { coord: scrollTarget.coord })
        options.onScrollToCell?.(scrollTarget)
      }
      return target
    },
    blur: (input) => core.value.store.setter(blurNameBoxAtom, input),
    revert: (input) => core.value.store.setter(revertNameBoxAtom, input),
  }
}
