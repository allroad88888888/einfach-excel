import type { Atom, Store } from '@einfach/core'
import {
  activateSheetTabAtom,
  addSheetTabAtom,
  beginSheetTabRenameAtom,
  cancelSheetTabDeleteAtom,
  commitSheetTabRenameAtom,
  commitSheetTabReorderAtom,
  confirmSheetTabDeleteAtom,
  dispatchSheetTabIntentAtom,
  disposeSheetTabsAtom,
  initializeSheetTabsAtom,
  requestSheetTabDeleteAtom,
  sheetTabsAtom,
  sheetTabsSheetsAtom,
  workspaceSessionAtom,
  type ActivateSheetTabInput,
  type BeginSheetTabRenameCommandInput,
  type CommitSheetTabRenameCommandInput,
  type CommitSheetTabReorderCommandInput,
  type RequestSheetTabDeleteInput,
  type SheetTabIntent,
  type SheetTabsState,
  type SpreadsheetSheetMetadata,
  type SpreadsheetUiCore,
  type WorkspaceSessionState,
} from '@einfach/spreadsheet-ui-core'
import { watch, type ComputedRef, type ShallowRef } from 'vue'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

/** Seed metadata supplied by the host before the live sheet list is available. */
export interface SpreadsheetSheetTabMetadataInput {
  readonly id: string
  readonly name: string
  readonly index?: number
}

/** The caller-owned seed list for the nearest provider's sheet-tab session. */
export interface UseSpreadsheetSheetTabsOptions {
  readonly sheets: readonly SpreadsheetSheetTabMetadataInput[]
}

/** UI-core-owned state and commands for the nearest provider's sheet tabs. */
export interface SpreadsheetSheetTabs {
  readonly state: Readonly<ShallowRef<SheetTabsState>>
  readonly sheets: Readonly<ShallowRef<readonly SpreadsheetSheetMetadata[]>>
  readonly workspace: Readonly<ShallowRef<WorkspaceSessionState>>
  activate: (input: ActivateSheetTabInput) => boolean
  dispatchIntent: (intent: SheetTabIntent) => SheetTabsState
  addSheet: () => Promise<void>
  beginRename: (input: BeginSheetTabRenameCommandInput) => boolean
  commitRename: (input: CommitSheetTabRenameCommandInput) => Promise<void>
  requestDelete: (input: RequestSheetTabDeleteInput) => boolean
  cancelDelete: () => void
  confirmDelete: () => Promise<void>
  commitReorder: (input: CommitSheetTabReorderCommandInput) => Promise<void>
}

function createCoreValueSource<T>(
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

function normalizeSeedSheets(
  sheets: readonly SpreadsheetSheetTabMetadataInput[],
): readonly SpreadsheetSheetMetadata[] {
  return sheets.map((sheet, index) => ({ ...sheet, index: sheet.index ?? index }))
}

/** Bridges sheet-tab lifecycle, state, and commands through the nearest SpreadsheetUiProvider. */
export function useSpreadsheetSheetTabs(
  options: UseSpreadsheetSheetTabsOptions,
): SpreadsheetSheetTabs {
  const core = useSpreadsheetUiCore()
  const seedSheets = normalizeSeedSheets(options.sheets)
  const state = useSpreadsheetValue(createCoreValueSource(core, sheetTabsAtom)).value
  const sheets = useSpreadsheetValue(createCoreValueSource(core, sheetTabsSheetsAtom)).value
  const workspace = useSpreadsheetValue(createCoreValueSource(core, workspaceSessionAtom)).value

  watch(
    core,
    (nextCore, _previousCore, onCleanup) => {
      void nextCore.store.setter(initializeSheetTabsAtom, {
        backend: nextCore.backend,
        sheets: seedSheets,
      })
      onCleanup(() => nextCore.store.setter(disposeSheetTabsAtom))
    },
    { immediate: true },
  )

  return {
    state,
    sheets,
    workspace,
    activate: (input) => core.value.store.setter(activateSheetTabAtom, input),
    dispatchIntent: (intent) => core.value.store.setter(dispatchSheetTabIntentAtom, intent),
    addSheet: () => core.value.store.setter(addSheetTabAtom),
    beginRename: (input) => core.value.store.setter(beginSheetTabRenameAtom, input),
    commitRename: (input) => core.value.store.setter(commitSheetTabRenameAtom, input),
    requestDelete: (input) => core.value.store.setter(requestSheetTabDeleteAtom, input),
    cancelDelete: () => core.value.store.setter(cancelSheetTabDeleteAtom),
    confirmDelete: () => core.value.store.setter(confirmSheetTabDeleteAtom),
    commitReorder: (input) => core.value.store.setter(commitSheetTabReorderAtom, input),
  }
}
