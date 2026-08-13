import type { Store } from '@einfach/core'
import {
  cancelEditingAtom,
  commitEditingAtom,
  editingDraftAtom,
  editingSessionAtom,
  startEditingAtom,
  type EditingCancelIntent,
  type EditingCommitInput,
  type EditingCommitIntent,
  type EditingDraftInput,
  type EditingSessionState,
  type EditingStartInput,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useMemo } from 'react'
import { useSpreadsheetUiCore } from './spreadsheet-ui-context'
import { useSpreadsheetValue, type SpreadsheetValueSource } from './use-spreadsheet-value'

export interface SpreadsheetEditing {
  /** The UI-core-owned editing session for the nearest provider. */
  readonly session: EditingSessionState
  /** The writable draft projection from the UI-core-owned editing session. */
  readonly draft: string
  cancel(): EditingCancelIntent | null
  commit(input: EditingCommitInput): EditingCommitIntent | null
  setDraft(input: EditingDraftInput): void
  start(input: EditingStartInput): EditingSessionState
}

function createEditingSessionSource(store: Store): SpreadsheetValueSource<EditingSessionState> {
  return {
    getSnapshot: () => store.getter(editingSessionAtom),
    subscribe: (onStoreChange) => store.sub(editingSessionAtom, onStoreChange),
  }
}

function createEditingDraftSource(store: Store): SpreadsheetValueSource<string> {
  return {
    getSnapshot: () => store.getter(editingDraftAtom),
    subscribe: (onStoreChange) => store.sub(editingDraftAtom, onStoreChange),
  }
}

/** Reads and dispatches the editing session owned by the nearest SpreadsheetUiProvider. */
export function useSpreadsheetEditing(): SpreadsheetEditing {
  const { store } = useSpreadsheetUiCore()
  const sessionSource = useMemo(() => createEditingSessionSource(store), [store])
  const draftSource = useMemo(() => createEditingDraftSource(store), [store])
  const session = useSpreadsheetValue(sessionSource)
  const draft = useSpreadsheetValue(draftSource)

  const start = useCallback(
    (input: EditingStartInput) => store.setter(startEditingAtom, input),
    [store],
  )
  const setDraft = useCallback(
    (input: EditingDraftInput) => store.setter(editingDraftAtom, input),
    [store],
  )
  const commit = useCallback(
    (input: EditingCommitInput) => store.setter(commitEditingAtom, input),
    [store],
  )
  const cancel = useCallback(() => store.setter(cancelEditingAtom), [store])

  return useMemo(
    () => ({ session, draft, start, setDraft, commit, cancel }),
    [cancel, commit, draft, session, setDraft, start],
  )
}
