import type { Store } from '@einfach/core'
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
  type ActivateSheetTabInput,
  type BeginSheetTabRenameCommandInput,
  type CommitSheetTabRenameCommandInput,
  type CommitSheetTabReorderCommandInput,
  type RequestSheetTabDeleteInput,
  type SheetTabIntent,
  type SheetTabsState,
  type SpreadsheetSheetMetadata,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useEffect, useMemo } from 'react'
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
  readonly state: SheetTabsState
  readonly sheets: readonly SpreadsheetSheetMetadata[]
  activate(input: ActivateSheetTabInput): boolean
  dispatchIntent(intent: SheetTabIntent): SheetTabsState
  addSheet(): Promise<void>
  beginRename(input: BeginSheetTabRenameCommandInput): boolean
  commitRename(input: CommitSheetTabRenameCommandInput): Promise<void>
  requestDelete(input: RequestSheetTabDeleteInput): boolean
  cancelDelete(): void
  confirmDelete(): Promise<void>
  commitReorder(input: CommitSheetTabReorderCommandInput): Promise<void>
}

function createSheetTabsStateSource(store: Store): SpreadsheetValueSource<SheetTabsState> {
  return {
    getSnapshot: () => store.getter(sheetTabsAtom),
    subscribe: (onStoreChange) => store.sub(sheetTabsAtom, onStoreChange),
  }
}

function createSheetTabsSheetsSource(
  store: Store,
): SpreadsheetValueSource<readonly SpreadsheetSheetMetadata[]> {
  return {
    getSnapshot: () => store.getter(sheetTabsSheetsAtom),
    subscribe: (onStoreChange) => store.sub(sheetTabsSheetsAtom, onStoreChange),
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
  const { backend, store } = useSpreadsheetUiCore()
  const seedSheets = useMemo(() => normalizeSeedSheets(options.sheets), [options.sheets])
  const stateSource = useMemo(() => createSheetTabsStateSource(store), [store])
  const sheetsSource = useMemo(() => createSheetTabsSheetsSource(store), [store])
  const state = useSpreadsheetValue(stateSource)
  const sheets = useSpreadsheetValue(sheetsSource)

  useEffect(() => {
    void store.setter(initializeSheetTabsAtom, { backend, sheets: seedSheets })
    return () => store.setter(disposeSheetTabsAtom)
  }, [backend, seedSheets, store])

  const activate = useCallback(
    (input: ActivateSheetTabInput) => store.setter(activateSheetTabAtom, input),
    [store],
  )
  const dispatchIntent = useCallback(
    (intent: SheetTabIntent) => store.setter(dispatchSheetTabIntentAtom, intent),
    [store],
  )
  const addSheet = useCallback(() => store.setter(addSheetTabAtom), [store])
  const beginRename = useCallback(
    (input: BeginSheetTabRenameCommandInput) => store.setter(beginSheetTabRenameAtom, input),
    [store],
  )
  const commitRename = useCallback(
    (input: CommitSheetTabRenameCommandInput) => store.setter(commitSheetTabRenameAtom, input),
    [store],
  )
  const requestDelete = useCallback(
    (input: RequestSheetTabDeleteInput) => store.setter(requestSheetTabDeleteAtom, input),
    [store],
  )
  const cancelDelete = useCallback(() => store.setter(cancelSheetTabDeleteAtom), [store])
  const confirmDelete = useCallback(() => store.setter(confirmSheetTabDeleteAtom), [store])
  const commitReorder = useCallback(
    (input: CommitSheetTabReorderCommandInput) => store.setter(commitSheetTabReorderAtom, input),
    [store],
  )

  return useMemo(
    () => ({
      state,
      sheets,
      activate,
      dispatchIntent,
      addSheet,
      beginRename,
      commitRename,
      requestDelete,
      cancelDelete,
      confirmDelete,
      commitReorder,
    }),
    [
      activate,
      addSheet,
      beginRename,
      cancelDelete,
      commitRename,
      commitReorder,
      confirmDelete,
      dispatchIntent,
      requestDelete,
      sheets,
      state,
    ],
  )
}
